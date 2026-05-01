// update-booking.js
// Allows the admin dashboard to update workflow flags on a booking,
// such as marking the invoice as scheduled or the balance as paid.
//
// Expected POST body: { id, field, value }
//   id    — booking id (the Stripe payment_intent id)
//   field — one of: invoiceScheduled, balancePaid
//   value — true | false
//
// Header: x-admin-key must match ADMIN_PASSWORD env var.

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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing env vars', hasSiteId: !!siteId, hasToken: !!token }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { id, field, value } = payload;
  if (!id || !field) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id or field' }) };
  }

  // Whitelist editable fields so callers can't overwrite arbitrary data
  const editableFields = new Set(['invoiceScheduled', 'balancePaid']);
  if (!editableFields.has(field)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Field not editable' }) };
  }

  try {
    const baseUrl = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings`;
    const headers = { 'Authorization': `Bearer ${token}` };

    // Load current bookings list
    let bookings = [];
    const getRes = await fetch(`${baseUrl}/all`, { headers });
    if (getRes.ok) {
      const text = await getRes.text();
      try { bookings = JSON.parse(text); } catch (e) { bookings = []; }
    }
    if (!Array.isArray(bookings)) bookings = [];

    // Find and update the matching booking
    const idx = bookings.findIndex(b => b.id === id);
    if (idx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Booking not found' }) };
    }

    bookings[idx][field] = !!value;
    // Maintain matching timestamp field (e.g. invoiceScheduledAt)
    const tsField = field + 'At';
    bookings[idx][tsField] = value ? new Date().toISOString() : null;

    // Persist
    const putRes = await fetch(`${baseUrl}/all`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: JSON.stringify(bookings),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Netlify API error', status: putRes.status, detail: errText }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, booking: bookings[idx] }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
