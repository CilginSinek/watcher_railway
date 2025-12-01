const { Ottoman } = require('ottoman');

let ottoman;

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
    
    ottoman = new Ottoman();
    
    await ottoman.connect({
      connectionString: connectionString,
      username: username,
      password: password,
      bucketName: bucketName
    });

    console.log('Ottoman connected successfully');
    
    // Ensure indexes are created
    await ottoman.start();
    console.log('Ottoman indexes ensured');
    
  } catch (error) {
    console.error('Ottoman connection error:', error);
    throw error;
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
  disconnect
};
