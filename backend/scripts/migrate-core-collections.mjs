import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

const apply = process.argv.includes('--apply');
const issues = [];
const plans = new Map();

function normalize(value = '') {
  return value.trim().toLocaleLowerCase('vi-VN').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');
}

function hash(value) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function add(collection, operation) {
  const operations = plans.get(collection) ?? [];
  operations.push(operation);
  plans.set(collection, operations);
}

function updateOne(id, set = {}, unset = {}) {
  return { updateOne: { filter: { _id: id }, update: { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) } } };
}

function issue(collection, id, message) {
  issues.push(`${collection}/${id}: ${message}`);
}

async function exists(database, name) {
  return database.listCollections({ name }, { nameOnly: true }).hasNext();
}

async function documents(database, name) {
  return await exists(database, name) ? database.collection(name).find({}).toArray() : [];
}

async function dropLegacyIndexes(collection, names) {
  const indexes = await collection.indexes();
  for (const index of indexes) {
    if (index.name && names.has(index.name)) await collection.dropIndex(index.name);
  }
}

async function recreateIndex(collection, name, key, options = {}) {
  const current = (await collection.indexes()).find((index) => index.name === name);
  if (current) await collection.dropIndex(name);
  await collection.createIndex(key, { ...options, name });
}

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required.');
  process.exitCode = 1;
} else {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const database = mongoose.connection.db;
    const names = ['users', 'user_sessions', 'auth_rate_limits', 'password_reset_requests', 'employees', 'departments', 'positions', 'department_positions', 'roles', 'workspace_modules', 'notifications', 'notification_reads', 'audit_logs'];
    const entries = await Promise.all(names.map(async (name) => [name, await documents(database, name)]));
    const data = Object.fromEntries(entries);

    const departmentsById = new Map(data.departments.map((item) => [item._id.toString(), item]));
    const departmentsByName = new Map(data.departments.map((item) => [normalize(item.name), item]));
    const positionsById = new Map(data.positions.map((item) => [item._id.toString(), item]));
    const positionsByName = new Map(data.positions.map((item) => [normalize(item.name), item]));
    const employeesById = new Map(data.employees.map((item) => [item._id.toString(), item]));
    const usersById = new Map(data.users.map((item) => [item._id.toString(), item]));

    const employeeOwner = new Map();
    for (const user of data.users) {
      let employeeId = user.employeeId;
      if (!employeeId) {
        const linked = data.employees.find((employee) => employee.userId?.toString() === user._id.toString());
        employeeId = linked?._id;
      }
      if (employeeId && !employeesById.has(employeeId.toString())) {
        issue('users', user._id, `employeeId ${employeeId} does not exist`);
        continue;
      }
      if (employeeId) {
        const currentOwner = employeeOwner.get(employeeId.toString());
        if (currentOwner && currentOwner !== user._id.toString()) issue('users', user._id, `employee ${employeeId} is linked to multiple users`);
        employeeOwner.set(employeeId.toString(), user._id.toString());
      }
      const roleIds = Array.isArray(user.roleIds) ? [...new Map(user.roleIds.map((id) => [id.toString(), id])).values()] : [];
      if (!roleIds.length) issue('users', user._id, 'roleIds is empty; run the roleIds migration first');
      add('users', updateOne(user._id, {
        ...(user.displayName || user.fullName ? { displayName: (user.displayName || user.fullName).trim() } : {}),
        ...(employeeId ? { employeeId } : {}),
        roleIds,
        email: user.email.trim().toLowerCase(),
        passwordChangedAt: user.passwordChangedAt ?? user.updatedAt ?? user.createdAt ?? new Date(),
      }, { fullName: '', department: '', role: '', roles: '' }));
    }

    for (const employee of data.employees) {
      const department = employee.departmentId ? departmentsById.get(employee.departmentId.toString()) : departmentsByName.get(normalize(employee.department));
      const position = employee.positionId ? positionsById.get(employee.positionId.toString()) : positionsByName.get(normalize(employee.position));
      if (!department) issue('employees', employee._id, `cannot resolve department from ${employee.departmentId ?? employee.department ?? 'empty'}`);
      if (!position) issue('employees', employee._id, `cannot resolve position from ${employee.positionId ?? employee.position ?? 'empty'}`);
      if (employee.userId) {
        const user = usersById.get(employee.userId.toString());
        if (!user) issue('employees', employee._id, `userId ${employee.userId} does not exist`);
        else if (user.employeeId && user.employeeId.toString() !== employee._id.toString()) issue('employees', employee._id, 'two-way user link conflicts with users.employeeId');
      }
      if (department && position) add('employees', updateOne(employee._id, {
        employeeCode: employee.employeeCode.trim().toUpperCase(),
        workEmail: employee.workEmail.trim().toLowerCase(),
        fullNameNormalized: normalize(employee.fullName),
        departmentId: department._id,
        positionId: position._id,
      }, { department: '', position: '', userId: '' }));
    }

    for (const department of data.departments) {
      add('departments', updateOne(department._id, { code: department.code.trim().toUpperCase(), nameNormalized: normalize(department.name) }));
    }
    for (const position of data.positions) {
      add('positions', updateOne(position._id, { code: position.code.trim().toUpperCase(), nameNormalized: normalize(position.name) }, { departmentId: '', department: '' }));
    }

    const assignmentPairs = new Set();
    for (const assignment of data.department_positions) {
      const positionId = assignment.positionId ?? assignment.jobTitleId;
      if (!departmentsById.has(assignment.departmentId?.toString())) issue('department_positions', assignment._id, 'departmentId does not exist');
      if (!positionId || !positionsById.has(positionId.toString())) issue('department_positions', assignment._id, 'positionId does not exist');
      const pair = `${assignment.departmentId}:${positionId}`;
      if (assignmentPairs.has(pair)) issue('department_positions', assignment._id, 'duplicate department/position pair');
      assignmentPairs.add(pair);
      if (positionId) add('department_positions', updateOne(assignment._id, { positionId }, { jobTitleId: '', updatedAt: '', isActive: '' }));
    }

    for (const role of data.roles) {
      const permissionKeys = [...new Set(Array.isArray(role.permissionKeys) && role.permissionKeys.length ? role.permissionKeys : (role.permissions ?? []))];
      add('roles', updateOne(role._id, { key: role.key.trim().toUpperCase(), nameNormalized: normalize(role.name), permissionKeys }, { permissions: '' }));
    }

    const workspacePermission = {
      DASHBOARD: 'DASHBOARD.VIEW', MY_REQUESTS: 'REQUESTS.VIEW_OWN', APPROVAL_INBOX: 'APPROVALS.APPROVE_ASSIGNED',
      FORM_BUILDER: 'FORM_BUILDER.VIEW', WORKFLOW_BUILDER: 'WORKFLOW_BUILDER.VIEW', EMPLOYEES: 'EMPLOYEE.VIEW',
      DEPARTMENTS: 'DEPARTMENT.VIEW', JOB_TITLES: 'JOB_TITLE.VIEW', USERS: 'USER.VIEW', ROLE_PERMISSIONS: 'ROLE.VIEW',
      AUDIT_LOGS: 'AUDIT_LOG.VIEW', WORKSPACE_MODULES: 'WORKSPACE_MODULE.VIEW',
    };
    for (const module of data.workspace_modules) {
      if (module.moduleKey === 'ORGANIZATION') {
        add('workspace_modules', { deleteOne: { filter: { _id: module._id } } });
        continue;
      }
      const requiredPermission = module.requiredPermission ?? workspacePermission[module.moduleKey];
      if (!requiredPermission) issue('workspace_modules', module._id, `no requiredPermission mapping for ${module.moduleKey}`);
      else add('workspace_modules', updateOne(module._id, { groupKey: module.groupKey ?? module.group, requiredPermission }, { group: '', visibleToRoles: '' }));
    }

    for (const notification of data.notifications) {
      const recipientUserId = notification.recipientUserId ?? notification.userId;
      const targetType = notification.targetType ?? (recipientUserId ? 'PERSONAL' : 'BROADCAST');
      const message = notification.message ?? notification.description;
      if (!message) issue('notifications', notification._id, 'message is empty');
      else add('notifications', updateOne(notification._id, {
        targetType,
        ...(recipientUserId ? { recipientUserId } : {}),
        message,
        ...(notification.isRead && !notification.readAt ? { readAt: notification.updatedAt ?? notification.createdAt ?? new Date() } : {}),
      }, { userId: '', description: '' }));
    }
    for (const read of data.notification_reads) {
      add('notification_reads', updateOne(read._id, { readAt: read.readAt ?? read.createdAt ?? new Date() }, { updatedAt: '' }));
    }

    for (const reset of data.password_reset_requests) {
      const status = reset.status ?? (reset.usedAt ? 'USED' : reset.verifiedAt ? 'VERIFIED' : 'PENDING');
      add('password_reset_requests', updateOne(reset._id, {
        emailSnapshot: (reset.emailSnapshot ?? reset.email).trim().toLowerCase(),
        status,
        maxAttempts: reset.maxAttempts ?? 5,
        lastSentAt: reset.lastSentAt ?? reset.updatedAt ?? reset.createdAt ?? new Date(),
        ...(status === 'VERIFIED' && !reset.resetTokenExpiresAt ? { resetTokenExpiresAt: reset.expiresAt } : {}),
      }, { email: '' }));
    }

    for (const rate of data.auth_rate_limits) {
      if (rate.action && rate.subjectHash) continue;
      const key = String(rate.key ?? '');
      let action;
      let subject;
      if (key.startsWith('login-ip:')) [action, subject] = ['LOGIN_IP', key.slice('login-ip:'.length)];
      else if (key.startsWith('login-failure:')) [action, subject] = ['LOGIN_FAILURE', key.slice('login-failure:'.length)];
      else if (key.startsWith('password-reset-request:')) [action, subject] = ['PASSWORD_RESET_REQUEST', key.slice('password-reset-request:'.length)];
      else if (key.startsWith('password-reset-cooldown:')) [action, subject] = ['PASSWORD_RESET_COOLDOWN', key.slice('password-reset-cooldown:'.length)];
      else issue('auth_rate_limits', rate._id, `unknown legacy key ${key}`);
      if (action) add('auth_rate_limits', updateOne(rate._id, { action, subjectHash: hash(subject), windowStartedAt: rate.windowStartedAt ?? rate.updatedAt ?? new Date() }, { key: '' }));
    }

    for (const log of data.audit_logs) {
      add('audit_logs', updateOne(log._id, {
        description: log.description?.trim() || `${log.action ?? 'SYSTEM'} event.`,
      }, { updatedAt: '' }));
    }

    for (const [name, operations] of plans) console.log(`${name}: ${operations.length} operation(s) planned.`);
    if (issues.length) {
      issues.forEach((message) => console.error(`- ${message}`));
      throw new Error(`${issues.length} data issue(s) must be resolved before migration; nothing was changed.`);
    }
    if (!apply) {
      console.log('Dry run completed. Run with --apply to migrate all 13 collections.');
    } else {
      // These unique legacy indexes reject the transient missing-field state while
      // documents are renamed one at a time. Validation above has already proven
      // that the target keys are complete and unique.
      if (await exists(database, 'department_positions')) {
        await dropLegacyIndexes(database.collection('department_positions'), new Set(['jobTitleId_1', 'departmentId_1_jobTitleId_1']));
      }
      if (await exists(database, 'auth_rate_limits')) {
        await dropLegacyIndexes(database.collection('auth_rate_limits'), new Set(['key_1']));
      }
      for (const [name, operations] of plans) {
        if (operations.length) await database.collection(name).bulkWrite(operations, { ordered: true });
      }

      if (await exists(database, 'users')) await dropLegacyIndexes(database.collection('users'), new Set(['role_1', 'roles_1', 'department_1', 'fullName_1']));
      if (await exists(database, 'employees')) await dropLegacyIndexes(database.collection('employees'), new Set(['userId_1', 'department_1', 'position_1']));
      if (await exists(database, 'positions')) await dropLegacyIndexes(database.collection('positions'), new Set(['departmentId_1']));
      if (await exists(database, 'department_positions')) await dropLegacyIndexes(database.collection('department_positions'), new Set(['jobTitleId_1', 'departmentId_1_jobTitleId_1']));
      if (await exists(database, 'workspace_modules')) await dropLegacyIndexes(database.collection('workspace_modules'), new Set(['group_1', 'visibleToRoles_1']));
      if (await exists(database, 'auth_rate_limits')) await dropLegacyIndexes(database.collection('auth_rate_limits'), new Set(['key_1']));

      if (await exists(database, 'users')) {
        const collection = database.collection('users');
        await recreateIndex(collection, 'employeeId_1', { employeeId: 1 }, { unique: true, partialFilterExpression: { employeeId: { $type: 'objectId' } } });
        await recreateIndex(collection, 'roleIds_1_isActive_1', { roleIds: 1, isActive: 1 });
      }
      if (await exists(database, 'auth_rate_limits')) {
        await recreateIndex(database.collection('auth_rate_limits'), 'action_1_subjectHash_1', { action: 1, subjectHash: 1 }, { unique: true });
      }
      if (await exists(database, 'password_reset_requests')) {
        const collection = database.collection('password_reset_requests');
        await dropLegacyIndexes(collection, new Set(['email_1']));
        await recreateIndex(collection, 'emailSnapshot_1_status_1', { emailSnapshot: 1, status: 1 });
        await recreateIndex(collection, 'resetTokenHash_1', { resetTokenHash: 1 }, { unique: true, sparse: true });
      }
      if (await exists(database, 'employees')) {
        const collection = database.collection('employees');
        await dropLegacyIndexes(collection, new Set(['employmentStatus_1', 'department_1_employmentStatus_1_createdAt_-1', 'departmentId_1_employmentStatus_1_createdAt_-1']));
        await recreateIndex(collection, 'fullNameNormalized_1', { fullNameNormalized: 1 });
        await recreateIndex(collection, 'departmentId_1_isActive_1_createdAt_-1', { departmentId: 1, isActive: 1, createdAt: -1 });
        await recreateIndex(collection, 'managerId_1_isActive_1', { managerId: 1, isActive: 1 });
      }
      if (await exists(database, 'departments')) {
        const collection = database.collection('departments');
        await dropLegacyIndexes(collection, new Set(['name_1']));
        await recreateIndex(collection, 'nameNormalized_1', { nameNormalized: 1 }, { unique: true });
        await recreateIndex(collection, 'parentId_1_isActive_1', { parentId: 1, isActive: 1 });
        await recreateIndex(collection, 'managerEmployeeId_1', { managerEmployeeId: 1 });
      }
      if (await exists(database, 'positions')) {
        const collection = database.collection('positions');
        await dropLegacyIndexes(collection, new Set(['name_1', 'isActive_1_departmentId_1_sortOrder_1_name_1']));
        await recreateIndex(collection, 'nameNormalized_1', { nameNormalized: 1 }, { unique: true });
        await recreateIndex(collection, 'isActive_1_sortOrder_1_name_1', { isActive: 1, sortOrder: 1, name: 1 });
      }
      if (await exists(database, 'department_positions')) {
        const collection = database.collection('department_positions');
        await recreateIndex(collection, 'departmentId_1_positionId_1', { departmentId: 1, positionId: 1 }, { unique: true });
        await recreateIndex(collection, 'positionId_1_departmentId_1', { positionId: 1, departmentId: 1 });
      }
      if (await exists(database, 'roles')) {
        await recreateIndex(database.collection('roles'), 'nameNormalized_1', { nameNormalized: 1 }, { unique: true });
      }
      if (await exists(database, 'workspace_modules')) {
        const collection = database.collection('workspace_modules');
        await dropLegacyIndexes(collection, new Set(['isEnabled_1_visibleToRoles_1_sortOrder_1']));
        await recreateIndex(collection, 'isEnabled_1_groupKey_1_sortOrder_1', { isEnabled: 1, groupKey: 1, sortOrder: 1 });
        await recreateIndex(collection, 'path_1', { path: 1 }, { unique: true });
      }
      if (await exists(database, 'notifications')) {
        const collection = database.collection('notifications');
        await dropLegacyIndexes(collection, new Set(['userId_1', 'userId_1_isRead_1_createdAt_-1']));
        await recreateIndex(collection, 'recipientUserId_1_isRead_1_createdAt_-1', { recipientUserId: 1, isRead: 1, createdAt: -1 });
        await recreateIndex(collection, 'targetType_1_createdAt_-1', { targetType: 1, createdAt: -1 });
        await recreateIndex(
          collection,
          'uniq_notification_dedupe_recipient',
          { dedupeKey: 1, recipientUserId: 1 },
          { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
        );
      }
      if (await exists(database, 'notification_reads')) {
        const collection = database.collection('notification_reads');
        await recreateIndex(collection, 'notificationId_1_userId_1', { notificationId: 1, userId: 1 }, { unique: true });
        await recreateIndex(collection, 'userId_1_notificationId_1', { userId: 1, notificationId: 1 });
      }
      if (await exists(database, 'audit_logs')) {
        const collection = database.collection('audit_logs');
        await recreateIndex(collection, 'idx_audit_resource_time', { 'resource.type': 1, 'resource.id': 1, occurredAt: -1 });
        await recreateIndex(collection, 'idx_audit_outcome_time', { outcome: 1, occurredAt: -1 });
      }

      const legacyChecks = {
        users: { $or: [{ fullName: { $exists: true } }, { department: { $exists: true } }, { role: { $exists: true } }, { roles: { $exists: true } }] },
        employees: { $or: [{ department: { $exists: true } }, { position: { $exists: true } }, { userId: { $exists: true } }] },
        positions: { departmentId: { $exists: true } },
        department_positions: { jobTitleId: { $exists: true } },
        roles: { permissions: { $exists: true } },
        workspace_modules: { $or: [{ group: { $exists: true } }, { visibleToRoles: { $exists: true } }] },
        notifications: { $or: [{ userId: { $exists: true } }, { description: { $exists: true } }] },
      };
      for (const [name, filter] of Object.entries(legacyChecks)) {
        if (await exists(database, name) && await database.collection(name).countDocuments(filter)) throw new Error(`Verification failed: ${name} still contains legacy fields.`);
      }
      console.log('Core collection migration completed and verified.');
    }
  } catch (error) {
    console.error(`Core collection migration aborted: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
