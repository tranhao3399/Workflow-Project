import mongoose from 'mongoose';

const dryRun = process.argv.includes('--dry-run');
const uri = process.env.MONGODB_URI;

if (!uri) throw new Error('MONGODB_URI is missing.');
if (process.env.NODE_ENV === 'production') {
  throw new Error('This development seed must not run in production.');
}

const FUNCTIONAL_UNIT_TYPES = new Set(['DEPARTMENT', 'FUNCTIONAL', 'UNCLASSIFIED']);
const LEADER_POSITION_BY_UNIT = new Map([
  ['NEXASPORT', 'CEO'],
  ['BOARD', 'CEO'],
  ['SALES_MARKETING', 'HEAD_OF_SALES_MARKETING'],
  ['PURCHASING', 'PURCHASING_MANAGER'],
  ['OPERATIONS_LOGISTICS', 'OPERATIONS_LOGISTICS_MANAGER'],
  ['ACCOUNTING_FINANCE', 'CHIEF_ACCOUNTANT'],
  ['HR_ADMIN', 'HR_ADMIN_MANAGER'],
  ['IT_SUPPORT', 'IT_LEAD'],
]);

const HEADCOUNT_BY_POSITION = new Map([
  ['CEO', 1],
  ['DEPUTY_DIRECTOR', 1],
  ['AREA_MANAGER', 1],
  ['STORE_MANAGER', 1],
  ['SHIFT_LEADER', 2],
  ['SALES_STAFF', 4],
  ['CASHIER', 2],
  ['INVENTORY_STAFF', 1],
  ['HEAD_OF_SALES_MARKETING', 1],
  ['DIGITAL_MARKETING_SPECIALIST', 2],
  ['B2B_SALES_SPECIALIST', 2],
  ['CUSTOMER_CARE_SPECIALIST', 2],
  ['PURCHASING_MANAGER', 1],
  ['PURCHASING_SPECIALIST', 3],
  ['OPERATIONS_LOGISTICS_MANAGER', 1],
  ['LOGISTICS_COORDINATOR', 3],
  ['CHIEF_ACCOUNTANT', 1],
  ['PAYMENT_ACCOUNTANT', 2],
  ['GENERAL_ACCOUNTANT', 3],
  ['HR_ADMIN_MANAGER', 1],
  ['RECRUITMENT_SPECIALIST', 2],
  ['HR_CB_SPECIALIST', 2],
  ['ADMINISTRATIVE_SPECIALIST', 2],
  ['IT_LEAD', 1],
  ['IT_SUPPORT_SPECIALIST', 3],
]);

const FAMILY_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương'];
const MIDDLE_NAMES = ['Minh', 'Thanh', 'Ngọc', 'Quốc', 'Thu', 'Hoài', 'Gia', 'Đức', 'Khánh', 'Phương', 'Anh', 'Hữu'];
const GIVEN_NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hân', 'Hiếu', 'Huy', 'Khang', 'Lan', 'Linh', 'Mai', 'Nam', 'Nga', 'Phúc', 'Quân', 'Thảo', 'Trang', 'Trinh', 'Tú', 'Vy', 'Yến'];

const normalizeName = (value) => value
  .trim()
  .toLocaleLowerCase('vi-VN')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ');

const stableNumber = (value) => {
  let result = 0;
  for (const character of value) result = ((result * 31) + character.codePointAt(0)) >>> 0;
  return result;
};

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

const profileFor = (seedKey, ordinal, unitCode, positionCode) => {
  const seed = stableNumber(seedKey);
  const fullName = `${FAMILY_NAMES[seed % FAMILY_NAMES.length]} ${MIDDLE_NAMES[Math.floor(seed / 7) % MIDDLE_NAMES.length]} ${GIVEN_NAMES[Math.floor(seed / 13) % GIVEN_NAMES.length]}`;
  const birthYear = 1984 + (seed % 19);
  const birthMonth = seed % 12;
  const birthDay = 1 + (seed % 27);
  const hiredYear = 2020 + (seed % 7);
  const employmentType = positionCode === 'SALES_STAFF' || positionCode === 'CASHIER'
    ? (ordinal % 4 === 0 ? 'PART_TIME' : 'OFFICIAL')
    : (ordinal % 7 === 0 ? 'CONTRACT' : 'OFFICIAL');
  const location = unitCode.startsWith('HN_') || unitCode === 'REGION'
    ? 'Hà Nội'
    : unitCode.startsWith('HCM_') || unitCode === 'REGION_HCM'
      ? 'TP. Hồ Chí Minh'
      : 'TP. Hồ Chí Minh';
  return {
    fullName,
    fullNameNormalized: normalizeName(fullName),
    phone: `0${900000000 + ordinal}`,
    address: `${12 + (seed % 180)} Đường Nội bộ NexaSport, ${location}`,
    dateOfBirth: new Date(Date.UTC(birthYear, birthMonth, birthDay)),
    hiredAt: new Date(Date.UTC(hiredYear, seed % 12, 1 + (seed % 20))),
    gender: ['MALE', 'FEMALE', 'OTHER'][seed % 3],
    annualLeaveDays: employmentType === 'PART_TIME' ? 6 : 12,
    employmentType,
  };
};

const targetHeadcount = (unit, positionCode) => {
  if (unit.unitType === 'STORE') return HEADCOUNT_BY_POSITION.get(positionCode) ?? 1;
  if (unit.unitType === 'REGION') return positionCode === 'AREA_MANAGER' ? 1 : 1;
  if (unit.unitType === 'COMPANY') return 1;
  return HEADCOUNT_BY_POSITION.get(positionCode) ?? 1;
};

await mongoose.connect(uri);
try {
  const db = mongoose.connection.db;
  const departments = db.collection('departments');
  const positions = db.collection('positions');
  const assignments = db.collection('department_positions');
  const employees = db.collection('employees');
  const sequences = db.collection('employee_code_sequences');

  const execute = async (session) => {
    const options = session ? { session } : {};
    const [departmentDocs, positionDocs, assignmentDocs, employeeDocs] = await Promise.all([
      departments.find({ isActive: { $ne: false } }, options).sort({ sortOrder: 1, code: 1 }).toArray(),
      positions.find({ isActive: { $ne: false } }, options).sort({ sortOrder: 1, code: 1 }).toArray(),
      assignments.find({}, options).toArray(),
      employees.find({}, options).toArray(),
    ]);

    const departmentById = new Map(departmentDocs.map((item) => [item._id.toString(), item]));
    const departmentByCode = new Map(departmentDocs.map((item) => [item.code, item]));
    const positionById = new Map(positionDocs.map((item) => [item._id.toString(), item]));
    const positionByCode = new Map(positionDocs.map((item) => [item.code, item]));
    const assignedFunctionalDepartmentByPosition = new Map();
    for (const assignment of assignmentDocs) {
      const unit = departmentById.get(assignment.departmentId.toString());
      const position = positionById.get(assignment.positionId.toString());
      if (!unit || !position || !FUNCTIONAL_UNIT_TYPES.has(unit.unitType)) continue;
      if (!assignedFunctionalDepartmentByPosition.has(position.code)) {
        assignedFunctionalDepartmentByPosition.set(position.code, unit);
      }
    }

    const activeAssignments = assignmentDocs
      .map((assignment) => ({
        unit: departmentById.get(assignment.departmentId.toString()),
        position: positionById.get(assignment.positionId.toString()),
      }))
      .filter(({ unit, position }) => unit && position)
      .sort((left, right) => (
        left.unit.sortOrder - right.unit.sortOrder
        || left.position.sortOrder - right.position.sortOrder
        || left.position.code.localeCompare(right.position.code)
      ));

    const allEmployees = [...employeeDocs];
    const existingEmails = new Set(employeeDocs.map((item) => item.workEmail));
    const planned = [];
    let profileOrdinal = 100;

    const coversAssignment = (employee, unit, position) => {
      if (employee.positionId?.toString() !== position._id.toString()) return false;
      return FUNCTIONAL_UNIT_TYPES.has(unit.unitType)
        ? employee.departmentId?.toString() === unit._id.toString()
        : employee.workUnitId?.toString() === unit._id.toString();
    };

    for (const { unit, position } of activeAssignments) {
      const target = targetHeadcount(unit, position.code);
      const current = allEmployees.filter((employee) => coversAssignment(employee, unit, position)).length;
      const missing = Math.max(0, target - current);
      let slot = 1;
      for (let index = 0; index < missing; index += 1) {
        let workEmail;
        do {
          workEmail = `seed.realistic.${slug(unit.code)}.${slug(position.code)}.${slot}@nexasport.local`;
          slot += 1;
        } while (existingEmails.has(workEmail));
        existingEmails.add(workEmail);

        const functionalDepartment = assignedFunctionalDepartmentByPosition.get(position.code);
        const department = FUNCTIONAL_UNIT_TYPES.has(unit.unitType)
          ? unit
          : (functionalDepartment ?? unit);
        const company = departmentByCode.get('NEXASPORT');
        const workUnit = FUNCTIONAL_UNIT_TYPES.has(unit.unitType)
          ? (company ?? unit)
          : unit;
        const seedKey = `${unit.code}:${position.code}:${slot - 1}`;
        const profile = profileFor(seedKey, profileOrdinal, unit.code, position.code);
        profileOrdinal += 1;
        const candidate = {
          _id: new mongoose.Types.ObjectId(),
          seedKey,
          workEmail,
          departmentId: department._id,
          workUnitId: workUnit._id,
          positionId: position._id,
          isActive: true,
          ...profile,
        };
        planned.push({ candidate, unit, department, workUnit, position });
        allEmployees.push(candidate);
      }
    }

    const coverage = activeAssignments.map(({ unit, position }) => ({
      unitCode: unit.code,
      unitName: unit.name,
      positionCode: position.code,
      positionName: position.name,
      target: targetHeadcount(unit, position.code),
      before: employeeDocs.filter((employee) => coversAssignment(employee, unit, position)).length,
      after: allEmployees.filter((employee) => coversAssignment(employee, unit, position)).length,
    }));

    if (dryRun) {
      return {
        database: db.databaseName,
        existingEmployees: employeeDocs.length,
        employeesToCreate: planned.length,
        expectedEmployees: employeeDocs.length + planned.length,
        coverage,
      };
    }

    const [latest] = await employees.aggregate([
      { $match: { employeeCode: /^NV-\d+$/i } },
      { $project: { sequence: { $convert: { input: { $arrayElemAt: [{ $split: ['$employeeCode', '-'] }, 1] }, to: 'int', onError: 0, onNull: 0 } } } },
      { $sort: { sequence: -1 } },
      { $limit: 1 },
    ], options).toArray();
    await sequences.updateOne(
      { key: 'EMPLOYEE' },
      { $setOnInsert: { key: 'EMPLOYEE', sequence: 0 } },
      { upsert: true, session },
    );
    await sequences.updateOne(
      { key: 'EMPLOYEE' },
      { $max: { sequence: latest?.sequence ?? 0 } },
      { session },
    );

    const now = new Date();
    const inserted = [];
    for (const item of planned) {
      const counter = await sequences.findOneAndUpdate(
        { key: 'EMPLOYEE' },
        { $inc: { sequence: 1 } },
        { returnDocument: 'after', session },
      );
      if (!counter) throw new Error('Unable to allocate employee code.');
      const employeeCode = `NV-${String(counter.sequence).padStart(3, '0')}`;
      const document = {
        ...item.candidate,
        employeeCode,
        createdAt: now,
        updatedAt: now,
      };
      delete document.seedKey;
      await employees.insertOne(document, { session });
      Object.assign(item.candidate, { employeeCode, createdAt: now, updatedAt: now });
      inserted.push(item.candidate);
    }

    const refreshedEmployees = [...employeeDocs, ...inserted];
    const positionCodeOf = (employee) => positionById.get(employee.positionId?.toString())?.code;
    const employeesAtWorkUnit = (unitId, positionCode) => refreshedEmployees
      .filter((employee) => employee.workUnitId?.toString() === unitId.toString() && positionCodeOf(employee) === positionCode)
      .sort((left, right) => String(left.employeeCode ?? '').localeCompare(String(right.employeeCode ?? '')));
    const employeesInDepartment = (departmentId, positionCode) => refreshedEmployees
      .filter((employee) => employee.departmentId?.toString() === departmentId.toString() && positionCodeOf(employee) === positionCode)
      .sort((left, right) => String(left.employeeCode ?? '').localeCompare(String(right.employeeCode ?? '')));

    const company = departmentByCode.get('NEXASPORT');
    const board = departmentByCode.get('BOARD');
    const ceo = (company && positionByCode.has('CEO')
      ? employeesAtWorkUnit(company._id, 'CEO')[0]
      : undefined) ?? (board ? employeesInDepartment(board._id, 'CEO')[0] : undefined);
    const operations = departmentByCode.get('OPERATIONS_LOGISTICS');
    const operationsManager = operations
      ? employeesInDepartment(operations._id, 'OPERATIONS_LOGISTICS_MANAGER')[0]
      : undefined;

    for (const employee of refreshedEmployees.filter((item) => item.workEmail?.startsWith('seed.realistic.'))) {
      const department = departmentById.get(employee.departmentId?.toString());
      const workUnit = departmentById.get(employee.workUnitId?.toString());
      const positionCode = positionCodeOf(employee);
      let manager;
      if (positionCode === 'CEO') manager = undefined;
      else if (positionCode === 'DEPUTY_DIRECTOR') manager = ceo;
      else if (workUnit?.unitType === 'REGION' && positionCode === 'AREA_MANAGER') manager = operationsManager ?? ceo;
      else if (workUnit?.unitType === 'STORE' && positionCode === 'STORE_MANAGER') {
        const parent = departmentById.get(workUnit.parentId?.toString());
        manager = parent ? employeesAtWorkUnit(parent._id, 'AREA_MANAGER')[0] : operationsManager ?? ceo;
      } else if (workUnit?.unitType === 'STORE') {
        const storeManager = employeesAtWorkUnit(workUnit._id, 'STORE_MANAGER')[0];
        const shiftLeaders = employeesAtWorkUnit(workUnit._id, 'SHIFT_LEADER');
        manager = positionCode === 'SHIFT_LEADER' ? storeManager : (shiftLeaders[0] ?? storeManager);
      } else if (department) {
        const leaderPositionCode = LEADER_POSITION_BY_UNIT.get(department.code);
        const departmentLeader = leaderPositionCode
          ? employeesInDepartment(department._id, leaderPositionCode)[0]
          : undefined;
        manager = departmentLeader?._id.toString() === employee._id.toString()
          ? ceo
          : (departmentLeader ?? ceo);
      }
      await employees.updateOne(
        { _id: employee._id },
        manager
          ? { $set: { managerId: manager._id, updatedAt: now } }
          : { $unset: { managerId: 1 }, $set: { updatedAt: now } },
        { session },
      );
      employee.managerId = manager?._id;
    }

    let managersAssigned = 0;
    for (const unit of departmentDocs) {
      if (unit.managerEmployeeId) continue;
      let manager;
      if (unit.unitType === 'REGION') manager = employeesAtWorkUnit(unit._id, 'AREA_MANAGER')[0];
      else if (unit.unitType === 'STORE') manager = employeesAtWorkUnit(unit._id, 'STORE_MANAGER')[0];
      else {
        const leaderPositionCode = LEADER_POSITION_BY_UNIT.get(unit.code);
        manager = leaderPositionCode
          ? employeesInDepartment(unit._id, leaderPositionCode)[0]
            ?? employeesAtWorkUnit(unit._id, leaderPositionCode)[0]
          : undefined;
      }
      if (!manager) continue;
      await departments.updateOne(
        {
          _id: unit._id,
          $or: [
            { managerEmployeeId: { $exists: false } },
            { managerEmployeeId: null },
          ],
        },
        { $set: { managerEmployeeId: manager._id, updatedAt: now } },
        { session },
      );
      managersAssigned += 1;
    }

    return {
      database: db.databaseName,
      existingEmployees: employeeDocs.length,
      employeesCreated: inserted.length,
      totalEmployees: employeeDocs.length + inserted.length,
      managersAssigned,
      coverage,
    };
  };

  let result;
  if (dryRun) result = await execute(undefined);
  else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        result = await execute(session);
      });
    } finally {
      await session.endSession();
    }
  }

  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', ...result }, null, 2));
} finally {
  await mongoose.disconnect();
}
