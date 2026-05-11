const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const store = getStore('bookings');

    let bookings = [];
    let blocks = [];

    try {
      const bookingsData = await store.get('all', { type: 'json' });
      if (Array.isArray(bookingsData)) bookings = bookingsData;
    } catch (e) {
      // 'all' key doesn't exist yet
    }

    try {
      const blocksData = await store.get('blocks', { type: 'json' });
      if (Array.isArray(blocksData)) blocks = blocksData;
    } catch (e) {
      // 'blocks' key doesn't exist yet
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookings, blocks }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message, stack: err.stack }) };
  }
};
