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
    const baseUrl = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/bookings`;
    const headers = { 'Authorization': `Bearer ${token}` };

    let bookings = [];
    let blocks = [];
    let debug = { SITE_ID, baseUrl };

    const bookingsRes = await fetch(`${baseUrl}/all`, { headers });
    debug.bookingsStatus = bookingsRes.status;
    debug.bookingsOk = bookingsRes.ok;
    const bookingsText = await bookingsRes.text();
    debug.bookingsTextLen = bookingsText.length;
    debug.bookingsTextSample = bookingsText.substring(0, 300);

    if (bookingsRes.ok) {
      try { bookings = JSON.parse(bookingsText); } catch(e) { 
        debug.parseError = e.message;
        bookings = []; 
      }
    }

    const blocksRes = await fetch(`${baseUrl}/blocks`, { headers });
    debug.blocksStatus = blocksRes.status;
    if (blocksRes.ok) {
      const text = await blocksRes.text();
      try { blocks = JSON.parse(text); } catch(e) { blocks = []; }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookings, blocks, debug }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
