const { Ottoman } = require('ottoman');

// Create Ottoman instance globally
const ottoman = new Ottoman();

/**
 * Initialize Ottoman connection
 */
async function connect() {
  try {
    const connectionString = process.env.COUCHBASE_CONNECTION_STRING || 'couchbase://localhost';
    const username = process.env.COUCHBASE_USERNAME || 'Administrator';
    const password = process.env.COUCHBASE_PASSWORD || 'password';
    const bucketName = process.env.COUCHBASE_BUCKET || 'students';

    console.log('Connecting to Couchbase with Ottoman...');
    console.log('Connection String:', connectionString);
    console.log('Bucket:', bucketName);
    
    await ottoman.connect({
      connectionString: connectionString,
      username: username,
      password: password,
      bucketName: bucketName
    });

    console.log('Ottoman connected successfully');
    
    // Don't call ottoman.start() immediately - let models initialize first
    console.log('Ottoman ready - models will be initialized on first use');
    
  } catch (error) {
    console.error('Ottoman connection error:', error);
    throw error;
  }
}

/**
 * Ensure indexes (call this after models are loaded)
 */
async function ensureIndexes() {
  try {
    if (!ottoman) {
      throw new Error('Ottoman not connected');
    }
    console.log('Ensuring Ottoman indexes...');
    await ottoman.start();
    console.log('Ottoman indexes ensured');
  } catch (error) {
    console.error('Error ensuring indexes:', error);
    // Don't throw - continue without indexes
  }
}

/**
 * Get the Ottoman instance
 */
function getOttoman() {
  if (!ottoman) {
    throw new Error('Ottoman not initialized. Call connect() first.');
  }
  return ottoman;
}

/**
 * Close Ottoman connection
 */
async function disconnect() {
  if (ottoman) {
    await ottoman.close();
    console.log('Ottoman disconnected');
  }
}

module.exports = {
  connect,
  getOttoman,
  disconnect,
  ensureIndexes,
  ottoman
};
