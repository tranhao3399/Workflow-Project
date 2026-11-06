import mongoose from 'mongoose';

const TARGET_UNITS = [
  {
    code: 'NEXASPORT',
    name: 'NexaSport',
    unitType: 'COMPANY',
    parentCode: null,
    sortOrder: 0,
  },
  {
    code: 'REGION_HCM',
    name: 'Khu vực TP.HCM',
    unitType: 'REGION',
    parentCode: 'NEXASPORT',
    sortOrder: 10,
  },
  {
    code: 'REGION_HN',
    name: 'Khu vực Hà Nội',
    unitType: 'REGION',
    parentCode: 'NEXASPORT',
    sortOrder: 20,
  },
  {
    code: 'HCM_STORE_01',
    name: 'Cửa hàng HCM 01',
    unitType: 'STORE',
    parentCode: 'REGION_HCM',
    sortOrder: 110,
  },
  {
    code: 'HCM_STORE_02',
    name: 'Cửa hàng HCM 02',
    unitType: 'STORE',
    parentCode: 'REGION_HCM',
    sortOrder: 120,
  },
  {
    code: 'HCM_STORE_03',
    name: 'Cửa hàng HCM 03',
    unitType: 'STORE',
    parentCode: 'REGION_HCM',
    sortOrder: 130,
  },
  {
    code: 'HCM_STORE_04',
    name: 'Cửa hàng HCM 04',
    unitType: 'STORE',
    parentCode: 'REGION_HCM',
    sortOrder: 140,
  },
  {
    code: 'HN_STORE_01',
    name: 'Cửa hàng HN 01',
    unitType: 'STORE',
    parentCode: 'REGION_HN',
    sortOrder: 210,
  },
  {
    code: 'HN_STORE_02',
    name: 'Cửa hàng HN 02',
    unitType: 'STORE',
    parentCode: 'REGION_HN',
    sortOrder: 220,
  },
  {
    code: 'HN_STORE_03',
    name: 'Cửa hàng HN 03',
    unitType: 'STORE',
    parentCode: 'REGION_HN',
    sortOrder: 230,
  },
  {
    code: 'BOARD',
    name: 'Ban Giám đốc',
    unitType: 'DEPARTMENT',
    parentCode: 'NEXASPORT',
    sortOrder: 310,
  },
  {
    code: 'SALES_MARKETING',
    name: 'Kinh doanh và Marketing',
    unitType: 'DEPARTMENT',
    parentCode: 'NEXASPORT',
    sortOrder: 320,
  },
  {
    code: 'PURCHASING',
    name: 'Mua hàng',
    unitType: 'DEPARTMENT',
    parentCode: 'NEXASPORT',
    sortOrder: 330,
  },
  {
    code: 'OPERATIONS_LOGISTICS',
    name: 'Vận hành chuỗi cửa hàng và Logistics',
    unitType: 'DEPARTMENT',
    parentCode: 'NEXASPORT',
    sortOrder: 340,
  },
  {
    code: 'ACCOUNTING_FINANCE',
    name: 'Kế toán – Tài chính',
    unitType: 'DEPARTMENT',
    parentCode: 'NEXASPORT',
    sortOrder: 350,
  },
  {
    code: 'HR_ADMIN',
    name: 'Hành chính – Nhân sự',
    unitType: 'DEPARTMENT',
    parentCode: 'NEXASPORT',
    sortOrder: 360,
  },
  {
    code: 'IT_SUPPORT',
    name: 'IT/Hỗ trợ hệ thống',
    unitType: 'DEPARTMENT',
    parentCode: 'NEXASPORT',
    sortOrder: 370,
  },
];

const SAFE_CODE_ALIASES = new Map([
  ['STORE_HCM_01', 'HCM_STORE_01'],
  ['STORE_HCM_02', 'HCM_STORE_02'],
  ['STORE_HCM_03', 'HCM_STORE_03'],
  ['STORE_HCM_04', 'HCM_STORE_04'],
  ['STORE_HN_01', 'HN_STORE_01'],
  ['STORE_HN_02', 'HN_STORE_02'],
  ['STORE_HN_03', 'HN_STORE_03'],
  ['IT_SYSTEMS', 'IT_SUPPORT'],
]);

const AMBIGUOUS_LEGACY_CODES = new Set([
  'ACCOUNTING',
  'HR',
  'BUSINESS',
  'ENGINEERING',
  'OPERATIONS',
  'STORE_CHAIN',
  'DEP_QA_TEST',
]);

const dryRun = process.argv.includes('--dry-run');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is missing.');
const normalizeName = (value) =>
  value
    .trim()
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');

const targetByCode = new Map(TARGET_UNITS.map((unit) => [unit.code, unit]));
if (targetByCode.size !== 17)
  throw new Error('Target organization must contain exactly 17 unique codes.');

await mongoose.connect(uri);
try {
  const db = mongoose.connection.db;
  const departments = db.collection('departments');
  const existing = await departments.find({}).toArray();
  const byCode = new Map(existing.map((unit) => [unit.code, unit]));
  const idToCode = new Map(
    existing.map((unit) => [String(unit._id), unit.code]),
  );
  const references = new Map(existing.map((unit) => [String(unit._id), []]));

  function findReferences(value, collection, documentId, path, results) {
    if (value == null) return;
    if (value instanceof mongoose.Types.ObjectId) {
      const departmentCode = idToCode.get(value.toString());
      if (departmentCode)
        results.push({ departmentCode, collection, documentId, path });
      return;
    }
    if (typeof value === 'string') {
      if (/^[a-f\d]{24}$/i.test(value)) {
        const departmentCode = idToCode.get(value.toLowerCase());
        if (departmentCode)
          results.push({ departmentCode, collection, documentId, path });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        findReferences(
          item,
          collection,
          documentId,
          `${path}[${index}]`,
          results,
        ),
      );
      return;
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        findReferences(
          item,
          collection,
          documentId,
          path ? `${path}.${key}` : key,
          results,
        );
      }
    }
  }

  const collectionNames = (
    await db.listCollections({}, { nameOnly: true }).toArray()
  ).map((item) => item.name);
  for (const collectionName of collectionNames) {
    const cursor = db.collection(collectionName).find({});
    while (await cursor.hasNext()) {
      const document = await cursor.next();
      if (!document) continue;
      const found = [];
      findReferences(document, collectionName, String(document._id), '', found);
      for (const reference of found) {
        const source = byCode.get(reference.departmentCode);
        const isOwnId =
          collectionName === 'departments' &&
          reference.documentId === String(source?._id) &&
          reference.path === '_id';
        if (source && !isOwnId) {
          references.get(String(source._id))?.push(reference);
        }
      }
    }
  }

  const ambiguous = existing.filter((unit) =>
    AMBIGUOUS_LEGACY_CODES.has(unit.code),
  );
  if (ambiguous.length) {
    const report = ambiguous.map((unit) => ({
      id: String(unit._id),
      code: unit.code,
      name: unit.name,
      references: references.get(String(unit._id)) ?? [],
    }));
    throw new Error(
      `Ambiguous legacy units require an explicit mapping decision; no data changed: ${JSON.stringify(report)}`,
    );
  }

  const allowedExistingCodes = new Set([
    ...targetByCode.keys(),
    ...SAFE_CODE_ALIASES.keys(),
  ]);
  const unsupported = existing.filter(
    (unit) => !allowedExistingCodes.has(unit.code),
  );
  if (unsupported.length) {
    const report = unsupported.map((unit) => ({
      id: String(unit._id),
      code: unit.code,
      name: unit.name,
      references: references.get(String(unit._id)) ?? [],
    }));
    throw new Error(
      `Unexpected units cannot be safely mapped or deleted; no data changed: ${JSON.stringify(report)}`,
    );
  }

  const aliasOperations = [];
  for (const [alias, target] of SAFE_CODE_ALIASES) {
    const source = byCode.get(alias);
    if (!source) continue;
    const destination = byCode.get(target);
    if (destination && String(destination._id) !== String(source._id)) {
      throw new Error(
        `Both alias ${alias} (${source._id}) and target ${target} (${destination._id}) exist. No records will be merged or deleted automatically.`,
      );
    }
    aliasOperations.push({ id: source._id, alias, target });
    byCode.delete(alias);
    byCode.set(target, { ...source, code: target });
  }

  const missing = TARGET_UNITS.filter((unit) => !byCode.has(unit.code));
  const beforePositionAssignments = await db
    .collection('department_positions')
    .countDocuments({});
  const beforeEmployeeCount = await db
    .collection('employees')
    .countDocuments({});
  const actions = {
    renameCodes: aliasOperations,
    createCodes: missing.map((unit) => unit.code),
    updateHierarchy: TARGET_UNITS.map((unit) => ({
      code: unit.code,
      type: unit.unitType,
      parent: unit.parentCode,
    })),
    removeCodes: [],
  };
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'apply',
        database: db.databaseName,
        currentCount: existing.length,
        targetCount: TARGET_UNITS.length,
        actions,
      },
      null,
      2,
    ),
  );
  if (dryRun) process.exitCode = 0;
  else {
    for (const operation of aliasOperations) {
      await departments.updateOne(
        { _id: operation.id, code: operation.alias },
        { $set: { code: operation.target } },
      );
    }

    for (const unit of TARGET_UNITS) {
      if (
        await departments.findOne(
          { code: unit.code },
          { projection: { _id: 1 } },
        )
      )
        continue;
      await departments.insertOne({
        _id: new mongoose.Types.ObjectId(),
        code: unit.code,
        name: unit.name,
        nameNormalized: normalizeName(unit.name),
        unitType: unit.unitType,
        isActive: true,
        sortOrder: unit.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const unitsAfterUpsert = await departments
      .find({ code: { $in: [...targetByCode.keys()] } })
      .toArray();
    const idsByCode = new Map(
      unitsAfterUpsert.map((unit) => [unit.code, unit._id]),
    );
    for (const unit of TARGET_UNITS) {
      const parentId = unit.parentCode
        ? idsByCode.get(unit.parentCode)
        : undefined;
      if (unit.parentCode && !parentId)
        throw new Error(`Missing parent ${unit.parentCode} for ${unit.code}.`);
      const set = {
        name: unit.name,
        nameNormalized: normalizeName(unit.name),
        unitType: unit.unitType,
        sortOrder: unit.sortOrder,
        ...(parentId ? { parentId } : {}),
      };
      await departments.updateOne(
        { code: unit.code },
        {
          $set: set,
          ...(!parentId ? { $unset: { parentId: '' } } : {}),
        },
      );
    }

    const finalUnits = await departments.find({}).sort({ code: 1 }).toArray();
    const finalByCode = new Map(finalUnits.map((unit) => [unit.code, unit]));
    const duplicateCodes = finalUnits
      .map((unit) => unit.code)
      .filter((code, index, all) => all.indexOf(code) !== index);
    const extraCodes = finalUnits
      .map((unit) => unit.code)
      .filter((code) => !targetByCode.has(code));
    if (
      finalUnits.length !== 17 ||
      duplicateCodes.length ||
      extraCodes.length
    ) {
      throw new Error(
        `Post-import count/code verification failed: ${JSON.stringify({ count: finalUnits.length, duplicateCodes, extraCodes })}`,
      );
    }

    for (const unit of TARGET_UNITS) {
      const actual = finalByCode.get(unit.code);
      const expectedParentId = unit.parentCode
        ? finalByCode.get(unit.parentCode)?._id
        : undefined;
      if (
        !actual ||
        actual.unitType !== unit.unitType ||
        String(actual.parentId ?? '') !== String(expectedParentId ?? '')
      ) {
        throw new Error(`Hierarchy verification failed for ${unit.code}.`);
      }
    }

    const currentIds = new Set(finalUnits.map((unit) => String(unit._id)));
    const departmentObjectIds = [...currentIds].map(
      (id) => new mongoose.Types.ObjectId(id),
    );
    const positionDocs = await db
      .collection('positions')
      .find({})
      .project({ _id: 1 })
      .toArray();
    const positionObjectIds = positionDocs.map((position) => position._id);
    const [
      invalidEmployees,
      invalidAssignments,
      afterPositionAssignments,
      afterEmployeeCount,
    ] = await Promise.all([
      db
        .collection('employees')
        .countDocuments({
          $or: [
            { departmentId: { $exists: true, $nin: departmentObjectIds } },
            { workUnitId: { $exists: true, $nin: departmentObjectIds } },
            { positionId: { $exists: true, $nin: positionObjectIds } },
          ],
        }),
      db
        .collection('department_positions')
        .countDocuments({
          $or: [
            { departmentId: { $nin: departmentObjectIds } },
            { positionId: { $nin: positionObjectIds } },
          ],
        }),
      db.collection('department_positions').countDocuments({}),
      db.collection('employees').countDocuments({}),
    ]);
    if (invalidEmployees || invalidAssignments) {
      throw new Error(
        `Existing references became invalid: ${JSON.stringify({ invalidEmployees, invalidAssignments })}`,
      );
    }
    if (
      beforePositionAssignments !== afterPositionAssignments ||
      beforeEmployeeCount !== afterEmployeeCount
    ) {
      throw new Error(
        'Employee records or job-title assignments changed unexpectedly.',
      );
    }
    const [invalidRequestSnapshots, invalidWorkflowDepartments] =
      await Promise.all([
        db
          .collection('requests')
          .countDocuments({
            $or: [
              {
                'requesterSnapshot.departmentId': {
                  $exists: true,
                  $nin: departmentObjectIds,
                },
              },
              {
                'requesterSnapshot.workUnitId': {
                  $exists: true,
                  $nin: departmentObjectIds,
                },
              },
            ],
          }),
        db
          .collection('workflow_definitions')
          .countDocuments({
            departmentId: { $exists: true, $nin: departmentObjectIds },
          }),
      ]);
    if (invalidRequestSnapshots || invalidWorkflowDepartments) {
      throw new Error(
        `Request/workflow department references are invalid: ${JSON.stringify({ invalidRequestSnapshots, invalidWorkflowDepartments })}`,
      );
    }
    console.log(
      JSON.stringify(
        {
          verified: true,
          departmentCount: finalUnits.length,
          positionAssignmentCount: afterPositionAssignments,
          employeeCount: afterEmployeeCount,
          invalidRequestSnapshots,
          invalidWorkflowDepartments,
          removedCodes: [],
        },
        null,
        2,
      ),
    );
  }
} finally {
  await mongoose.disconnect();
}
