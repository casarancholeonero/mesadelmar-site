exports.handler = async function(event) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Hardcoded to match stripe-webhook's effective siteId.
  // process.env.NETLIFY_SITE_ID returns a different value for different functions
  // in this Netlify project, which caused get-bookings to read from the wrong blob store.
  const siteId = 'cb8ea563-05dc-4e13-8d42-0e1ad838699f';
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing auth token' }) };
  }

  try {
    const baseUrl = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings`;
    const headers = { 'Authorization': `Bearer ${token}` };

    let bookings = [];
    let blocks = [];

    const bookingsRes = await fetch(`${baseUrl}/all`, { headers });
    if (bookingsRes.ok) {
      const text = await bookingsRes.text();
      try { bookings = JSON.parse(text); } catch(e) { bookings = []; }
    }

    const blocksRes = await fetch(`${baseUrl}/blocks`, { headers });
    if (blocksRes.ok) {
      const text = await blocksRes.text();
      try { blocks = JSON.parse(text); } catch(e) { blocks = []; }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookings, blocks }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
