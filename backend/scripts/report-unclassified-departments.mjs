import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is missing.');

await mongoose.connect(uri);
try {
  const departments = await mongoose.connection.collection('departments')
    .find(
      { $or: [{ unitType: { $exists: false } }, { unitType: null }, { unitType: 'UNCLASSIFIED' }] },
      { projection: { _id: 1, code: 1, name: 1 } },
    )
    .sort({ code: 1 })
    .toArray();
  console.log(JSON.stringify(departments.map(({ _id, code, name }) => ({ id: String(_id), code, name })), null, 2));
} finally {
  await mongoose.disconnect();
}
