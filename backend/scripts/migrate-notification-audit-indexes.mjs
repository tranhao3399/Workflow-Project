import mongoose from 'mongoose';

const apply = process.argv.includes('--apply');
const NOTIFICATION_INDEX = 'uniq_notification_dedupe_recipient';
const AUDIT_RESOURCE_INDEX = 'idx_audit_resource_time';
const AUDIT_OUTCOME_INDEX = 'idx_audit_outcome_time';

function hasExactKey(index, expected) {
  const actualEntries = Object.entries(index.key ?? {});
  const expectedEntries = Object.entries(expected);
  return actualEntries.length === expectedEntries.length
    && expectedEntries.every(([key, value]) => index.key?.[key] === value);
}

function hasDedupePartialFilter(index) {
  return index.partialFilterExpression?.dedupeKey?.$type === 'string';
}

function assertCompatibleNamedIndex(indexes, name, key, options = {}) {
  const current = indexes.find((index) => index.name === name);
  if (!current) return false;
  const compatible = hasExactKey(current, key)
    && (!options.unique || current.unique === true)
    && (!options.partial || hasDedupePartialFilter(current));
  if (!compatible) throw new Error(`Index ${name} already exists with an incompatible definition.`);
  return true;
}

function isLegacyDedupeIndex(index) {
  return index.unique === true && hasExactKey(index, { dedupeKey: 1 });
}

function displayRecipient(value) {
  return value === null || value === undefined ? '<BROADCAST>' : value.toString();
}

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required.');
  process.exitCode = 1;
} else {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const database = mongoose.connection.db;
    const notifications = database.collection('notifications');
    const auditLogs = database.collection('audit_logs');

    const duplicates = await notifications.aggregate([
      { $match: { dedupeKey: { $type: 'string' } } },
      {
        $group: {
          _id: {
            dedupeKey: '$dedupeKey',
            recipientUserId: { $ifNull: ['$recipientUserId', null] },
          },
          count: { $sum: 1 },
          documentIds: { $push: '$_id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { '_id.dedupeKey': 1 } },
    ]).toArray();

    if (duplicates.length) {
      console.error('Cannot create the notification dedupe index. Duplicate pairs were found:');
      for (const duplicate of duplicates) {
        console.error(
          `- dedupeKey=${duplicate._id.dedupeKey}, recipientUserId=${displayRecipient(duplicate._id.recipientUserId)}, count=${duplicate.count}, ids=${duplicate.documentIds.join(',')}`,
        );
      }
      throw new Error('Resolve duplicate notification pairs manually, then run this migration again.');
    }

    const notificationIndexes = await notifications.indexes();
    const auditIndexes = await auditLogs.indexes();
    const legacyIndexes = notificationIndexes.filter(isLegacyDedupeIndex);
    const hasNotificationIndex = assertCompatibleNamedIndex(
      notificationIndexes,
      NOTIFICATION_INDEX,
      { dedupeKey: 1, recipientUserId: 1 },
      { unique: true, partial: true },
    );
    const hasAuditResourceIndex = assertCompatibleNamedIndex(
      auditIndexes,
      AUDIT_RESOURCE_INDEX,
      { 'resource.type': 1, 'resource.id': 1, occurredAt: -1 },
    );
    const hasAuditOutcomeIndex = assertCompatibleNamedIndex(
      auditIndexes,
      AUDIT_OUTCOME_INDEX,
      { outcome: 1, occurredAt: -1 },
    );

    console.log(`Legacy single-field dedupe indexes to drop: ${legacyIndexes.length}.`);
    console.log(`${NOTIFICATION_INDEX}: ${hasNotificationIndex ? 'already valid' : 'will be created'}.`);
    console.log(`${AUDIT_RESOURCE_INDEX}: ${hasAuditResourceIndex ? 'already valid' : 'will be created'}.`);
    console.log(`${AUDIT_OUTCOME_INDEX}: ${hasAuditOutcomeIndex ? 'already valid' : 'will be created'}.`);

    if (!apply) {
      console.log('Check completed. Run again with --apply to update indexes.');
    } else {
      for (const index of legacyIndexes) await notifications.dropIndex(index.name);
      if (!hasNotificationIndex) {
        await notifications.createIndex(
          { dedupeKey: 1, recipientUserId: 1 },
          {
            name: NOTIFICATION_INDEX,
            unique: true,
            partialFilterExpression: { dedupeKey: { $type: 'string' } },
          },
        );
      }
      if (!hasAuditResourceIndex) {
        await auditLogs.createIndex(
          { 'resource.type': 1, 'resource.id': 1, occurredAt: -1 },
          { name: AUDIT_RESOURCE_INDEX },
        );
      }
      if (!hasAuditOutcomeIndex) {
        await auditLogs.createIndex(
          { outcome: 1, occurredAt: -1 },
          { name: AUDIT_OUTCOME_INDEX },
        );
      }
      console.log('Notification and Audit Log indexes migrated successfully.');
    }
  } catch (error) {
    console.error(`Index migration aborted: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
