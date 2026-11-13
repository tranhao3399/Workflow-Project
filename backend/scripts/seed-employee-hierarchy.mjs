import mongoose from 'mongoose';

const dryRun = process.argv.includes('--dry-run');
const uri = process.env.MONGODB_URI;

if (!uri) throw new Error('MONGODB_URI is missing.');
if (process.env.NODE_ENV === 'production') {
  throw new Error('This development seed must not run in production.');
}

const normalizeName = (value) => value
  .trim()
  .toLocaleLowerCase('vi-VN')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ');

const samples = [
  {
    employeeCode: 'DEMO-ORG-CEO',
    fullName: 'Nguyễn Minh Anh',
    workEmail: 'demo.hierarchy.ceo@nexasport.local',
    departmentCode: 'BOARD',
    workUnitCode: 'NEXASPORT',
    positionCandidates: ['CEO', 'GENERAL_DIRECTOR', 'DEPUTY_DIRECTOR'],
  },
  {
    employeeCode: 'DEMO-ORG-HCM-AREA',
    fullName: 'Trần Quốc Bảo',
    workEmail: 'demo.hierarchy.hcm.area@nexasport.local',
    departmentCode: 'OPERATIONS_LOGISTICS',
    workUnitCode: 'REGION_HCM',
    positionCandidates: ['AREA_MANAGER', 'OPERATIONS_LOGISTICS_MANAGER'],
    managerCode: 'DEMO-ORG-CEO',
  },
  {
    employeeCode: 'DEMO-ORG-HN-AREA',
    fullName: 'Lê Thu Hà',
    workEmail: 'demo.hierarchy.hn.area@nexasport.local',
    departmentCode: 'OPERATIONS_LOGISTICS',
    // Development data currently uses REGION for Khu vực Hà Nội.
    workUnitCode: 'REGION',
    positionCandidates: ['AREA_MANAGER', 'OPERATIONS_LOGISTICS_MANAGER'],
    managerCode: 'DEMO-ORG-CEO',
  },
  {
    employeeCode: 'DEMO-ORG-HCM01-MGR',
    fullName: 'Phạm Hoàng Long',
    workEmail: 'demo.hierarchy.hcm01.manager@nexasport.local',
    departmentCode: 'OPERATIONS_LOGISTICS',
    workUnitCode: 'HCM_STORE_01',
    positionCandidates: ['STORE_MANAGER', 'AREA_MANAGER', 'OPERATIONS_LOGISTICS_MANAGER'],
    managerCode: 'DEMO-ORG-HCM-AREA',
  },
  {
    employeeCode: 'DEMO-ORG-HCM02-MGR',
    fullName: 'Võ Ngọc Mai',
    workEmail: 'demo.hierarchy.hcm02.manager@nexasport.local',
    departmentCode: 'OPERATIONS_LOGISTICS',
    workUnitCode: 'HCM_STORE_02',
    positionCandidates: ['STORE_MANAGER', 'AREA_MANAGER', 'OPERATIONS_LOGISTICS_MANAGER'],
    managerCode: 'DEMO-ORG-HCM-AREA',
  },
  {
    employeeCode: 'DEMO-ORG-HN01-MGR',
    fullName: 'Đỗ Quang Huy',
    workEmail: 'demo.hierarchy.hn01.manager@nexasport.local',
    departmentCode: 'OPERATIONS_LOGISTICS',
    workUnitCode: 'HN_STORE_01',
    positionCandidates: ['STORE_MANAGER', 'AREA_MANAGER', 'OPERATIONS_LOGISTICS_MANAGER'],
    managerCode: 'DEMO-ORG-HN-AREA',
  },
  {
    employeeCode: 'DEMO-ORG-HCM01-STAFF1',
    fullName: 'Bùi Gia Hân',
    workEmail: 'demo.hierarchy.hcm01.staff1@nexasport.local',
    departmentCode: 'SALES_MARKETING',
    workUnitCode: 'HCM_STORE_01',
    positionCandidates: ['SALES_STAFF', 'SALES_SPECIALIST', 'DIGITAL_MARKETING_SPECIALIST'],
    managerCode: 'DEMO-ORG-HCM01-MGR',
  },
  {
    employeeCode: 'DEMO-ORG-HCM01-STAFF2',
    fullName: 'Nguyễn Đức Nam',
    workEmail: 'demo.hierarchy.hcm01.staff2@nexasport.local',
    departmentCode: 'SALES_MARKETING',
    workUnitCode: 'HCM_STORE_01',
    positionCandidates: ['SALES_STAFF', 'SALES_SPECIALIST', 'DIGITAL_MARKETING_SPECIALIST'],
    managerCode: 'DEMO-ORG-HCM01-MGR',
  },
  {
    employeeCode: 'DEMO-ORG-HCM02-STAFF',
    fullName: 'Trương Mỹ Linh',
    workEmail: 'demo.hierarchy.hcm02.staff@nexasport.local',
    departmentCode: 'SALES_MARKETING',
    workUnitCode: 'HCM_STORE_02',
    positionCandidates: ['SALES_STAFF', 'SALES_SPECIALIST', 'DIGITAL_MARKETING_SPECIALIST'],
    managerCode: 'DEMO-ORG-HCM02-MGR',
  },
  {
    employeeCode: 'DEMO-ORG-HN01-STAFF',
    fullName: 'Hoàng Tuấn Kiệt',
    workEmail: 'demo.hierarchy.hn01.staff@nexasport.local',
    departmentCode: 'SALES_MARKETING',
    workUnitCode: 'HN_STORE_01',
    positionCandidates: ['SALES_STAFF', 'SALES_SPECIALIST', 'DIGITAL_MARKETING_SPECIALIST'],
    managerCode: 'DEMO-ORG-HN01-MGR',
  },
  {
    employeeCode: 'DEMO-ORG-IT-MGR',
    fullName: 'Ngô Thành Công',
    workEmail: 'demo.hierarchy.it.manager@nexasport.local',
    departmentCode: 'IT_SUPPORT',
    workUnitCode: 'NEXASPORT',
    positionCandidates: ['IT_MANAGER', 'HEAD_OF_IT', 'SYSTEM_ADMINISTRATOR'],
    managerCode: 'DEMO-ORG-CEO',
  },
  {
    employeeCode: 'DEMO-ORG-IT-STAFF',
    fullName: 'Lý Minh Khoa',
    workEmail: 'demo.hierarchy.it.staff@nexasport.local',
    departmentCode: 'IT_SUPPORT',
    workUnitCode: 'NEXASPORT',
    positionCandidates: ['IT_SUPPORT_SPECIALIST', 'SYSTEM_ADMINISTRATOR', 'IT_MANAGER'],
    managerCode: 'DEMO-ORG-IT-MGR',
  },
];

await mongoose.connect(uri);
try {
  const database = mongoose.connection.db;
  const departments = database.collection('departments');
  const positions = database.collection('positions');
  const assignments = database.collection('department_positions');
  const employees = database.collection('employees');
  const employeeCodeSequences = database.collection('employee_code_sequences');
  const requiredDepartmentCodes = [...new Set(samples.flatMap((sample) => [
    sample.departmentCode,
    sample.workUnitCode,
  ]))];
  const departmentDocs = await departments
    .find({ code: { $in: requiredDepartmentCodes } })
    .project({ code: 1, name: 1 })
    .toArray();
  const departmentByCode = new Map(departmentDocs.map((item) => [item.code, item]));
  const missingDepartments = requiredDepartmentCodes.filter((code) => !departmentByCode.has(code));
  if (missingDepartments.length) {
    const availableDepartments = await departments
      .find({})
      .project({ code: 1, name: 1 })
      .sort({ code: 1 })
      .toArray();
    throw new Error(
      `Missing required departments: ${missingDepartments.join(', ')}. Available: ${availableDepartments.map((item) => `${item.code} (${item.name})`).join(', ')}`,
    );
  }

  const businessDepartmentIds = [...new Set(samples.map((sample) => (
    departmentByCode.get(sample.departmentCode)._id.toString()
  )))].map((id) => new mongoose.Types.ObjectId(id));
  const assignmentDocs = await assignments
    .find({ departmentId: { $in: businessDepartmentIds } })
    .toArray();
  const positionIds = [...new Set(assignmentDocs.map((item) => item.positionId.toString()))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const positionDocs = await positions
    .find({ _id: { $in: positionIds }, isActive: { $ne: false } })
    .sort({ sortOrder: 1, name: 1 })
    .toArray();
  const positionById = new Map(positionDocs.map((item) => [item._id.toString(), item]));
  const assignedPositionsByDepartment = new Map();
  for (const assignment of assignmentDocs) {
    const position = positionById.get(assignment.positionId.toString());
    if (!position) continue;
    const key = assignment.departmentId.toString();
    assignedPositionsByDepartment.set(key, [
      ...(assignedPositionsByDepartment.get(key) ?? []),
      position,
    ]);
  }

  const resolvedSamples = samples.map((sample) => {
    const department = departmentByCode.get(sample.departmentCode);
    const workUnit = departmentByCode.get(sample.workUnitCode);
    const availablePositions = assignedPositionsByDepartment.get(department._id.toString()) ?? [];
    const position = sample.positionCandidates
      .map((code) => availablePositions.find((item) => item.code === code))
      .find(Boolean) ?? availablePositions[0];
    if (!position) {
      throw new Error(`Department ${sample.departmentCode} has no active assigned position.`);
    }
    return { ...sample, department, workUnit, position };
  });

  const existingSamples = await employees
    .find({
      $or: [
        { workEmail: { $in: resolvedSamples.map((sample) => sample.workEmail) } },
        { employeeCode: { $in: resolvedSamples.map((sample) => sample.employeeCode) } },
      ],
    })
    .project({ _id: 1, employeeCode: 1, workEmail: 1 })
    .toArray();
  const existingByEmail = new Map(existingSamples.map((item) => [item.workEmail, item]));
  const [latestNumberedEmployee] = await employees
    .aggregate([
      { $match: { employeeCode: /^NV-\d+$/i } },
      {
        $project: {
          sequence: {
            $convert: {
              input: { $arrayElemAt: [{ $split: ['$employeeCode', '-'] }, 1] },
              to: 'int',
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      { $sort: { sequence: -1 } },
      { $limit: 1 },
    ])
    .toArray();
  const currentSequence = await employeeCodeSequences.findOne({ key: 'EMPLOYEE' });
  let previewSequence = Math.max(
    currentSequence?.sequence ?? 0,
    latestNumberedEmployee?.sequence ?? 0,
  );
  const previewCodeBySeedKey = new Map();
  for (const sample of resolvedSamples) {
    const currentCode = existingByEmail.get(sample.workEmail)?.employeeCode;
    const nextCode = /^NV-\d+$/i.test(currentCode ?? '')
      ? currentCode.toUpperCase()
      : `NV-${String(++previewSequence).padStart(3, '0')}`;
    previewCodeBySeedKey.set(sample.employeeCode, nextCode);
  }

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : 'apply',
    database: database.databaseName,
    sampleCount: resolvedSamples.length,
    hierarchy: resolvedSamples.map((sample) => ({
      employeeCode: previewCodeBySeedKey.get(sample.employeeCode),
      fullName: sample.fullName,
      managerCode: sample.managerCode
        ? previewCodeBySeedKey.get(sample.managerCode)
        : null,
      department: sample.department.code,
      workUnit: sample.workUnit.code,
      position: sample.position.code,
    })),
  }, null, 2));

  if (dryRun) process.exitCode = 0;
  else {
    const now = new Date();
    await employeeCodeSequences.updateOne(
      { key: 'EMPLOYEE' },
      { $setOnInsert: { key: 'EMPLOYEE', sequence: 0 } },
      { upsert: true },
    );
    await employeeCodeSequences.updateOne(
      { key: 'EMPLOYEE' },
      { $max: { sequence: latestNumberedEmployee?.sequence ?? 0 } },
    );
    const allocateNextEmployeeCode = async () => {
      const counter = await employeeCodeSequences.findOneAndUpdate(
        { key: 'EMPLOYEE' },
        { $inc: { sequence: 1 } },
        { returnDocument: 'after' },
      );
      if (!counter) throw new Error('Unable to allocate employee code.');
      return `NV-${String(counter.sequence).padStart(3, '0')}`;
    };

    const persistedBySeedKey = new Map();
    for (const sample of resolvedSamples) {
      const existing = existingByEmail.get(sample.workEmail)
        ?? await employees.findOne({ employeeCode: sample.employeeCode });
      const employeeCode = /^NV-\d+$/i.test(existing?.employeeCode ?? '')
        ? existing.employeeCode.toUpperCase()
        : await allocateNextEmployeeCode();
      const update = {
        $set: {
          employeeCode,
          fullName: sample.fullName,
          fullNameNormalized: normalizeName(sample.fullName),
          workEmail: sample.workEmail,
          departmentId: sample.department._id,
          workUnitId: sample.workUnit._id,
          positionId: sample.position._id,
          employmentType: 'FULL_TIME',
          isActive: true,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      };
      if (existing) {
        await employees.updateOne({ _id: existing._id }, update);
        persistedBySeedKey.set(sample.employeeCode, {
          _id: existing._id,
          employeeCode,
        });
      } else {
        const inserted = await employees.findOneAndUpdate(
          { workEmail: sample.workEmail },
          update,
          { upsert: true, returnDocument: 'after' },
        );
        if (!inserted) throw new Error(`Unable to seed ${sample.fullName}.`);
        persistedBySeedKey.set(sample.employeeCode, inserted);
      }
    }

    for (const sample of resolvedSamples) {
      const employee = persistedBySeedKey.get(sample.employeeCode);
      const manager = sample.managerCode
        ? persistedBySeedKey.get(sample.managerCode)
        : undefined;
      await employees.updateOne(
        { _id: employee._id },
        manager
          ? { $set: { managerId: manager._id, updatedAt: now } }
          : { $unset: { managerId: 1 }, $set: { updatedAt: now } },
      );
    }

    const seededIds = [...persistedBySeedKey.values()].map((item) => item._id);
    const verified = await employees
      .find({ _id: { $in: seededIds } })
      .project({ _id: 1, employeeCode: 1, managerId: 1 })
      .toArray();
    const codeById = new Map(verified.map((item) => [item._id.toString(), item.employeeCode]));
    console.log(JSON.stringify({
      applied: true,
      employeeCount: verified.length,
      links: verified
        .map((item) => ({
          employeeCode: item.employeeCode,
          managerCode: item.managerId ? codeById.get(item.managerId.toString()) ?? 'OUTSIDE_SEED' : null,
        }))
        .sort((left, right) => left.employeeCode.localeCompare(right.employeeCode)),
    }, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
