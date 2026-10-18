import mongoose from 'mongoose';

const applyChanges = process.argv.includes('--apply');
const batchSize = 500;

function fail(message) {
  console.error(`User role migration aborted: ${message}`);
  process.exitCode = 1;
}

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

if (!process.env.MONGODB_URI) {
  fail('MONGODB_URI is required.');
} else {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const database = mongoose.connection.db;
    const [usersExist, rolesExist] = await Promise.all([
      database.listCollections({ name: 'users' }, { nameOnly: true }).hasNext(),
      database.listCollections({ name: 'roles' }, { nameOnly: true }).hasNext(),
    ]);
    if (!usersExist || !rolesExist) throw new Error('Both users and roles collections must exist.');

    const [users, roles] = await Promise.all([
      database.collection('users').find({}, { projection: { roleIds: 1, role: 1, roles: 1 } }).toArray(),
      database.collection('roles').find({}, { projection: { key: 1 } }).toArray(),
    ]);
    const roleIdByKey = new Map(roles.map((role) => [role.key, role._id]));
    const roleIdById = new Map(roles.map((role) => [role._id.toString(), role._id]));
    const validRoleIds = new Set(roleIdById.keys());
    const issues = [];
    const operations = [];

    for (const user of users) {
      const storedRoleIds = Array.isArray(user.roleIds) ? user.roleIds : [];
      const legacyKeys = [...new Set([
        ...(Array.isArray(user.roles) ? user.roles : []),
        ...(typeof user.role === 'string' ? [user.role] : []),
      ])];
      let nextRoleIds;

      if (storedRoleIds.length > 0) {
        const uniqueIds = [...new Map(storedRoleIds.map((roleId) => [roleId.toString(), roleId])).values()];
        const invalidIds = uniqueIds.filter((roleId) => !validRoleIds.has(roleId.toString()));
        if (invalidIds.length) {
          issues.push(`${user._id}: roleIds references missing roles (${invalidIds.map(String).join(', ')})`);
          continue;
        }
        const missingLegacyKeys = legacyKeys.filter((key) => !roleIdByKey.has(key));
        const currentIds = new Set(uniqueIds.map(String));
        const legacyOnlyKeys = legacyKeys.filter((key) => {
          const roleId = roleIdByKey.get(key);
          return roleId && !currentIds.has(roleId.toString());
        });
        if (missingLegacyKeys.length || legacyOnlyKeys.length) {
          issues.push(`${user._id}: roleIds conflicts with legacy roles${missingLegacyKeys.length ? `; unknown keys: ${missingLegacyKeys.join(', ')}` : ''}${legacyOnlyKeys.length ? `; legacy-only keys: ${legacyOnlyKeys.join(', ')}` : ''}`);
          continue;
        }
        nextRoleIds = uniqueIds.map((roleId) => roleIdById.get(roleId.toString()));
      } else {
        const missingKeys = legacyKeys.filter((key) => !roleIdByKey.has(key));
        if (!legacyKeys.length || missingKeys.length) {
          issues.push(`${user._id}: cannot resolve legacy roles${missingKeys.length ? ` (${missingKeys.join(', ')})` : ''}`);
          continue;
        }
        nextRoleIds = legacyKeys.map((key) => roleIdByKey.get(key));
      }

      operations.push({
        updateOne: {
          filter: {
            _id: user._id,
            roleIds: Object.prototype.hasOwnProperty.call(user, 'roleIds') ? user.roleIds : { $exists: false },
            role: Object.prototype.hasOwnProperty.call(user, 'role') ? user.role : { $exists: false },
            roles: Object.prototype.hasOwnProperty.call(user, 'roles') ? user.roles : { $exists: false },
          },
          update: { $set: { roleIds: nextRoleIds }, $unset: { role: '', roles: '' } },
        },
      });
    }

    console.log(`Users inspected: ${users.length}.`);
    console.log(`Users ready: ${operations.length}.`);
    if (issues.length) {
      for (const issue of issues) console.error(`- ${issue}`);
      throw new Error(`${issues.length} user(s) require manual role reconciliation; no data was changed.`);
    }

    if (!applyChanges) {
      console.log('Dry run completed. Run again with --apply to update users and remove role/roles.');
    } else {
      let modifiedCount = 0;
      let matchedCount = 0;
      for (const batch of chunks(operations, batchSize)) {
        const result = await database.collection('users').bulkWrite(batch, { ordered: false });
        modifiedCount += result.modifiedCount;
        matchedCount += result.matchedCount;
      }
      if (matchedCount !== operations.length) {
        throw new Error(`${operations.length - matchedCount} user(s) changed during migration. Review the data and run the migration again.`);
      }
      const [legacyFieldCount, missingRoleCount] = await Promise.all([
        database.collection('users').countDocuments({ $or: [{ role: { $exists: true } }, { roles: { $exists: true } }] }),
        database.collection('users').countDocuments({ $or: [{ roleIds: { $exists: false } }, { roleIds: { $size: 0 } }] }),
      ]);
      if (legacyFieldCount || missingRoleCount) {
        throw new Error(`Verification failed: ${legacyFieldCount} legacy document(s), ${missingRoleCount} user(s) without roleIds.`);
      }
      console.log(`Migration completed: ${modifiedCount} user document(s) updated.`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : 'unknown migration error.');
  } finally {
    await mongoose.disconnect();
  }
}
