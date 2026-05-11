const { connectLambda, getStore, listStores } = require('@netlify/blobs');

exports.handler = async function(event) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    connectLambda(event);

    const result = { stores: {}, listError: null };

    try {
      const listed = await listStores();
      result.listed = listed;
    } catch (e) {
      result.listError = e.message;
    }

    // Try reading from store named 'bookings'
    try {
      const store = getStore('bookings');
      const keys = await store.list();
      const all = await store.get('all', { type: 'json' });
      result.stores.bookings = {
        keys,
        allLength: Array.isArray(all) ? all.length : 'not array',
        allSample: Array.isArray(all) && all[0] ? all[0].id : null,
      };
    } catch (e) {
      result.stores.bookings = { error: e.message };
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
