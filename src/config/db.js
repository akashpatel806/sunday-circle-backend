const mongoose = require('mongoose');
const { MONGODB_URI } = require('./env');

let mongodInstance = null;

async function connectDB() {
  try {
    console.log(`[Database] Attempting connection to MongoDB at: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 2500,
    });
    console.log('[Database] Connected to external/local MongoDB successfully.');
  } catch (err) {
    console.warn(`[Database] Standard MongoDB connection failed: ${err.message}`);
    console.log('[Database] Initializing embedded MongoDB server fallback for local development...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongodInstance = await MongoMemoryServer.create({
        instance: {
          dbName: 'sunday_circle',
        },
      });
      const uri = mongodInstance.getUri();
      console.log(`[Database] Embedded MongoDB running at: ${uri}`);
      await mongoose.connect(uri);
      console.log('[Database] Connected to embedded MongoDB successfully.');
    } catch (memErr) {
      console.error('[Database] Fatal: Unable to initialize MongoDB:', memErr.message);
      throw memErr;
    }
  }

  mongoose.connection.on('error', (e) => {
    console.error('[Database] Runtime MongoDB connection error:', e);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Database] MongoDB disconnected.');
  });
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (mongodInstance) {
    await mongodInstance.stop();
  }
}

module.exports = { connectDB, disconnectDB };
