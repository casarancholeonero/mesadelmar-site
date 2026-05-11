const { connectLambda, getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    // Bootstrap the Blobs SDK with the Lambda function's runtime context.
    // This injects the right credentials so getStore() works.
    connectLambda(event);

    const store = getStore('bookings');

    let bookings = [];
    let blocks = [];

    try {
      const bookingsData = await store.get('all', { type: 'json' });
      if (Array.isArray(bookingsData)) bookings = bookingsData;
    } catch (e) {
      // 'all' key may not exist yet
    }

    try {
      const blocksData = await store.get('blocks', { type: 'json' });
      if (Array.isArray(blocksData)) blocks = blocksData;
    } catch (e) {
      // 'blocks' key may not exist yet
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
