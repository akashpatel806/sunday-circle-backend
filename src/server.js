const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { PORT } = require('./config/env');
const { seedDatabaseIfEmpty } = require('./scripts/seed');

let server;

async function startServer() {
  try {
    console.log('--- SUNDAY CIRCLE BACKEND SERVICE ---');
    await connectDB();

    // Auto-seed initial sample data if DB is empty
    await seedDatabaseIfEmpty();

    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Sunday Circle API active on http://0.0.0.0:${PORT}`);
      console.log(`[Server] Local access: http://127.0.0.1:${PORT}/api/health`);
      console.log(`[Server] Android Emulator access: http://10.0.2.2:${PORT}/api`);
    });
  } catch (err) {
    console.error('[Server] Failed to launch server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Commencing graceful shutdown...`);
  if (server) {
    server.close(async () => {
      console.log('[Server] HTTP server closed.');
      await disconnectDB();
      console.log('[Server] Database disconnected. Exiting process.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();
