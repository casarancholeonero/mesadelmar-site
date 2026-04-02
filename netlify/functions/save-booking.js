exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('bookings');
    const data = JSON.parse(event.body);

    if (data.action === 'add-block') {
      const blocks = await store.get('blocks', { type: 'json' }).catch(() => []);
      const blockList = Array.isArray(blocks) ? blocks : [];
      blockList.push({
        id: Date.now().toString(),
        type: data.type, // 'casita' or 'boat'
        checkin: data.checkin,
        checkout: data.checkout,
        note: data.note || 'Manual block',
        createdAt: new Date().toISOString(),
      });
      await store.set('blocks', JSON.stringify(blockList));
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    if (data.action === 'remove-block') {
      const blocks = await store.get('blocks', { type: 'json' }).catch(() => []);
      const blockList = Array.isArray(blocks) ? blocks : [];
      const updated = blockList.filter(b => b.id !== data.id);
      await store.set('blocks', JSON.stringify(updated));
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
