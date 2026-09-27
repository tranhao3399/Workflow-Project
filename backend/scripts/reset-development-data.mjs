import mongoose from 'mongoose';

const collectionNames = [
  'audit_logs',
  'department_positions',
  'departments',
  'employees',
  'positions',
  'roles',
  'users',
  'workspace_modules',
];

function fail(message) {
  console.error(`Reset aborted: ${message}`);
  process.exitCode = 1;
}

if (process.env.NODE_ENV === 'production') {
  fail('NODE_ENV=production is not allowed.');
} else if (process.env.RESET_DEVELOPMENT_DATA !== 'true') {
  fail('set RESET_DEVELOPMENT_DATA=true before running this script.');
} else if (!process.env.MONGODB_URI) {
  fail('MONGODB_URI is required.');
} else {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const database = mongoose.connection.db;

    for (const name of collectionNames) {
      const collectionExists = await database.listCollections({ name }, { nameOnly: true }).hasNext();
      if (!collectionExists) {
        console.log(`Skipped ${name}: collection does not exist.`);
        continue;
      }

      const result = await database.collection(name).deleteMany({});
      console.log(`Cleared ${name}: ${result.deletedCount} document(s).`);
    }

    console.log('Development data reset completed. Collections and indexes were preserved.');
  } catch (error) {
    fail(error instanceof Error ? error.message : 'unknown database error.');
  } finally {
    await mongoose.disconnect();
  }
}
