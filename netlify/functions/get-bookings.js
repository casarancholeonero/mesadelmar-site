exports.handler = async function(event) {
  // Simple password check via header
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('bookings');
    const bookings = await store.get('all', { type: 'json' }).catch(() => []);
    const blocks = await store.get('blocks', { type: 'json' }).catch(() => []);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookings: Array.isArray(bookings) ? bookings : [],
        blocks: Array.isArray(blocks) ? blocks : [],
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
