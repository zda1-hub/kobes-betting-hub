require('dotenv').config();

const { closeAuditStore, initializeAuditStore } = require('./audit-store');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to run audit migrations.');
  await initializeAuditStore();
  console.log('Pick-operation audit schema is ready.');
  await closeAuditStore();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
