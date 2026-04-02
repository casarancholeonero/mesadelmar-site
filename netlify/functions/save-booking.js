exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!siteId || !token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing NETLIFY_SITE_ID or NETLIFY_AUTH_TOKEN' }) };
  }

  try {
    const data = JSON.parse(event.body);
    const baseUrl = `https://api.netlify.com/api/v1/sites/${siteId}/blobs`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Get existing blocks
    let blockList = [];
    const getRes = await fetch(`${baseUrl}/blocks`, { headers });
    if (getRes.ok) {
      const text = await getRes.text();
      try { blockList = JSON.parse(text); } catch(e) { blockList = []; }
    }

    if (data.action === 'add-block') {
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

    // Save updated blocks
    const putRes = await fetch(`${baseUrl}/blocks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(blockList),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save: ' + errText }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
