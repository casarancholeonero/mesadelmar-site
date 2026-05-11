const blobs = require('@netlify/blobs');
const pkgJson = require('@netlify/blobs/package.json');

exports.handler = async function(event) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    blobs.connectLambda(event);

    const result = { 
      sdkVersion: pkgJson.version,
      attempts: {} 
    };

    // Try with strong consistency
    try {
      const store = blobs.getStore({ name: 'bookings', consistency: 'strong' });
      const all = await store.get('all', { type: 'json' });
      const keys = await store.list();
      result.attempts.strong = {
        hasData: Array.isArray(all),
        length: Array.isArray(all) ? all.length : 'not array',
        keys: keys.blobs ? keys.blobs.map(k => k.key) : [],
      };
    } catch (e) {
      result.attempts.strong = { error: e.message };
    }

    // Try default consistency
    try {
      const store = blobs.getStore('bookings');
      const all = await store.get('all', { type: 'json' });
      result.attempts.default = {
        hasData: Array.isArray(all),
        length: Array.isArray(all) ? all.length : 'not array',
      };
    } catch (e) {
      result.attempts.default = { error: e.message };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result, null, 2),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message, stack: err.stack }) };
  }
};
