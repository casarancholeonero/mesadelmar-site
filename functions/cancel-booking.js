// cancel-booking.js
// Cancel (or restore) a guest booking from the owner dashboard.
//
// Why this exists: the PUBLIC site marks dates unavailable using the booking
// list stored in Netlify Blobs (key 'all' — see get-blocked-dates.js). Cancelling
// a guest therefore has to REMOVE their booking from that list so the dates open
// back up. It also flags the Stripe PaymentIntent so the dashboard stops showing
// the booking as active (see get-stripe-bookings.js).
//
// This does NOT refund money. Refunds are issued by hand in the Stripe dashboard.
//
// POST body: { id, action?, reason? }
//   id     — Stripe payment_intent id (the booking id used across the UI)
//   action — 'cancel' (default) or 'restore'
//   reason — optional note stored on the payment for your records (cancel only)
// Header: x-admin-key must match the ADMIN_PASSWORD env var.

const Stripe = require('stripe');
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

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { id, reason } = payload;
  const action = payload.action || 'cancel';
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing booking id' }) };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const store = getStore('bookings');
  const now = new Date().toISOString();

  const num = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // ─────────────────────────────── CANCEL ───────────────────────────────
  if (action === 'cancel') {
    // 1. Flag the PaymentIntent. Metadata updates work on ANY status (including
    //    an already-captured deposit), so this is reliable no matter where the
    //    payment is in its lifecycle. We never call paymentIntents.cancel()
    //    (that only works pre-capture) and we never issue a refund here.
    try {
      await stripe.paymentIntents.update(id, {
        metadata: {
          cancelled: 'true',
          cancelledAt: now,
          cancelReason: (reason || '').slice(0, 500),
        },
      });
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Stripe update failed: ' + err.message }) };
    }

    // 2. Remove the booking from the public availability list so the dates free
    //    up immediately. If it isn't in the list (older booking, or already
    //    removed) that's fine — we simply no-op.
    try {
      let bookings = await store.get('all', { type: 'json' });
      if (Array.isArray(bookings)) {
        const filtered = bookings.filter(b => b.id !== id);
        if (filtered.length !== bookings.length) {
          await store.setJSON('all', filtered);
        }
      }
    } catch (err) {
      // The Stripe flag already succeeded, so the dashboard is correct; report
      // the partial issue so the owner knows to re-check the public calendar.
      return { statusCode: 200, body: JSON.stringify({ success: true, warning: 'Flagged cancelled, but freeing the public dates failed: ' + err.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, action: 'cancel', cancelledAt: now }) };
  }

  // ─────────────────────────────── RESTORE ──────────────────────────────
  if (action === 'restore') {
    // 1. Clear the cancellation flags on the PaymentIntent.
    let pi;
    try {
      pi = await stripe.paymentIntents.update(id, {
        metadata: { cancelled: 'false', cancelledAt: '', cancelReason: '', restoredAt: now },
      });
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Stripe update failed: ' + err.message }) };
    }

    // 2. Put the booking back into the public availability list (rebuilt from
    //    the PaymentIntent's own metadata) so the dates block again.
    try {
      const meta = pi.metadata || {};
      const booking = {
        id: pi.id,
        type: meta.type || 'casita',
        checkin: meta.checkin || '',
        checkout: meta.checkout || '',
        nights: meta.nights || '',
        days: meta.days || '',
        casitaCheckin: meta.casitaCheckin || '',
        casitaCheckout: meta.casitaCheckout || '',
        guests: meta.guests || '',
        firstName: meta.firstName || '',
        lastName: meta.lastName || '',
        email: meta.email || '',
        phone: meta.phone || '',
        message: meta.message || '',
        amount: pi.amount / 100,
        subtotal: num(meta.subtotal),
        cleaningFee: num(meta.cleaningFee),
        iva: num(meta.iva),
        total: num(meta.total),
        balance: num(meta.balance),
        invoiceScheduled: meta.invoiceScheduled === 'true',
        invoiceScheduledAt: meta.invoiceScheduledAt || null,
        balancePaid: meta.balancePaid === 'true',
        balancePaidAt: meta.balancePaidAt || null,
        status: 'confirmed',
        source: 'stripe',
        restoredAt: now,
      };
      let bookings = await store.get('all', { type: 'json' });
      if (!Array.isArray(bookings)) bookings = [];
      if (!bookings.some(b => b.id === id)) {
        bookings.push(booking);
        await store.setJSON('all', bookings);
      }
    } catch (err) {
      return { statusCode: 200, body: JSON.stringify({ success: true, warning: 'Cleared the cancelled flag, but re-blocking the dates failed: ' + err.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, action: 'restore', restoredAt: now }) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
};
