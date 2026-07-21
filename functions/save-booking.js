// save-booking.js
// Adds or removes manual date blocks (owner dashboard → "Block Dates").
// Storage now goes through the official @netlify/blobs SDK. When this runs
// inside a Netlify Function, credentials are injected automatically —
// no NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN needed.

const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async function (event) {
  connectLambda(event);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    const store = getStore('bookings');

    // Load the current block list (strong consistency so we don't clobber a
    // recent write during this read-modify-write cycle).
    let blockList = await store.get('blocks', { type: 'json' });
    if (!Array.isArray(blockList)) blockList = [];

    if (data.action === 'add-block') {
      if (!data.checkin || !data.checkout) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing checkin or checkout date' }) };
      }
      blockList.push({
        id: Date.now().toString(),
        type: data.type,
        checkin: data.checkin,
        checkout: data.checkout,
        note: data.note || 'Manual block',
        createdAt: new Date().toISOString(),
      });
    } else if (data.action === 'remove-block') {
      blockList = blockList.filter(b => b.id !== data.id);
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    await store.setJSON('blocks', blockList);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
