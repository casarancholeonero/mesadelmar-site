const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const store = getStore('bookings');

    let bookings = [];
    let blocks = [];

    try {
      const b = await store.get('all');
      if (b) bookings = JSON.parse(b);
    } catch(e) { bookings = []; }

    try {
      const bl = await store.get('blocks');
      if (bl) blocks = JSON.parse(bl);
    } catch(e) { blocks = []; }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookings, blocks }),
    };
  } catch (err) {
    console.error('get-bookings error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
