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

  // Debug: return env var status
  if (!siteId || !token) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: 'Missing env vars',
        hasSiteId: !!siteId,
        hasToken: !!token,
      }) 
    };
  }

  try {
    const data = JSON.parse(event.body);
    const baseUrl = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    };

    // Get existing blocks
    let blockList = [];
    const getRes = await fetch(`${baseUrl}/blocks`, { 
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
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
    }

    const putRes = await fetch(`${baseUrl}/blocks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(blockList),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return { 
        statusCode: 500, 
        body: JSON.stringify({ 
          error: 'Netlify API error',
          status: putRes.status,
          detail: errText,
          url: baseUrl
        }) 
      };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: err.message, stack: err.stack }) 
    };
  }
};
