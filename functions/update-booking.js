// update-booking.js
// Updates workflow flags on a booking (invoiceScheduled, balancePaid).
// Storage now goes through the official @netlify/blobs SDK.
//
// Expected POST body: { id, field, value }
//   id    — booking id (the Stripe payment_intent id)
//   field — one of: invoiceScheduled, balancePaid
//   value — true | false
// Header: x-admin-key must match ADMIN_PASSWORD env var.

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
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

  // Whitelist editable fields so callers can't overwrite arbitrary data.
  const editableFields = new Set(['invoiceScheduled', 'balancePaid']);
  if (!editableFields.has(field)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Field not editable' }) };
  }

  try {
    const store = getStore('bookings');

    let bookings = await store.get('all', { type: 'json', consistency: 'strong' });
    if (!Array.isArray(bookings)) bookings = [];

    const idx = bookings.findIndex(b => b.id === id);
    if (idx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Booking not found' }) };
    }

    bookings[idx][field] = !!value;
    bookings[idx][field + 'At'] = value ? new Date().toISOString() : null;

    await store.setJSON('all', bookings);

    return { statusCode: 200, body: JSON.stringify({ success: true, booking: bookings[idx] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
