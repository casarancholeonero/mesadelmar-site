// update-booking.js
// Updates workflow flags on a booking: invoiceScheduled, balancePaid.
//
// IMPORTANT: the dashboard reads these flags from the Stripe PaymentIntent's
// metadata (see get-stripe-bookings.js), so this writes them there — to the
// same place they're read from. That's what makes the Action Items checkboxes
// and the "Mark paid" button in the bookings table actually stick.
//
// POST body: { id, field, value }
//   id    — the Stripe payment_intent id (used as the booking id in the UI)
//   field — one of: invoiceScheduled, balancePaid
//   value — true | false
// Header: x-admin-key must match the ADMIN_PASSWORD env var.

const Stripe = require('stripe');

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

  // Whitelist editable fields so callers can't overwrite arbitrary metadata.
  const editableFields = new Set(['invoiceScheduled', 'balancePaid']);
  if (!editableFields.has(field)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Field not editable' }) };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const tsField = field + 'At';

    // Stripe merges metadata keys, so this updates just these two and leaves
    // the rest of the booking's metadata untouched.
    await stripe.paymentIntents.update(id, {
      metadata: {
        [field]: value ? 'true' : 'false',
        [tsField]: value ? new Date().toISOString() : '',
      },
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
