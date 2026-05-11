const { getStore } = require('@netlify/blobs');

const SITE_ID = 'cb8ea563-05dc-4e13-8d42-0e1ad838699f';

exports.handler = async function(event) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing NETLIFY_AUTH_TOKEN' }) };
  }

  try {
    // Pass siteID and token explicitly as the SDK error message instructed
    const store = getStore({
      name: 'bookings',
      siteID: SITE_ID,
      token: token,
    });

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
