// get-bookings.js
// Returns all bookings + manual blocks for the owner dashboard.
// Reads through the official @netlify/blobs SDK (auto credentials in Functions).

const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async function (event) {
  connectLambda(event);

  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const store = getStore('bookings');

    let bookings = await store.get('all', { type: 'json' });
    let blocks = await store.get('blocks', { type: 'json' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookings: Array.isArray(bookings) ? bookings : [],
        blocks: Array.isArray(blocks) ? blocks : [],
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
