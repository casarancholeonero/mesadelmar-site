const Stripe = require('stripe');
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // We record a booking at TWO points in the manual-capture lifecycle:
  //   • amount_capturable_updated → guest authorized the deposit (status: requires_capture)
  //     This is when the booking should first appear + block the calendar.
  //   • succeeded                 → deposit was captured in Stripe (status: succeeded)
  //     This just flips the booking to "captured".
  const AUTH_EVENT = 'payment_intent.amount_capturable_updated';
  const CAPTURE_EVENT = 'payment_intent.succeeded';

  if (stripeEvent.type === AUTH_EVENT || stripeEvent.type === CAPTURE_EVENT) {
    const paymentIntent = stripeEvent.data.object;
    const captured = stripeEvent.type === CAPTURE_EVENT;

    const meta = paymentIntent.metadata || {};
    const num = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const now = new Date().toISOString();

    const incoming = {
      id: paymentIntent.id,
      type: meta.type || 'casita',

      // Stay dates
      checkin: meta.checkin || '',
      checkout: meta.checkout || '',
      nights: meta.nights || '',
      days: meta.days || '',
      casitaCheckin: meta.casitaCheckin || '',
      casitaCheckout: meta.casitaCheckout || '',

      // Guest details
      guests: meta.guests || '',
      firstName: meta.firstName || '',
      lastName: meta.lastName || '',
      email: meta.email || '',
      phone: meta.phone || '',
      message: meta.message || '',

      // Payment + pricing
      amount: paymentIntent.amount / 100,
      subtotal: num(meta.subtotal),
      cleaningFee: num(meta.cleaningFee),
      iva: num(meta.iva),
      total: num(meta.total),
      balance: num(meta.balance),

      // Workflow tracking (defaults; admin dashboard updates these)
      invoiceScheduled: false,
      invoiceScheduledAt: null,
      balancePaid: false,
      balancePaidAt: null,

      // Status + audit
      status: 'confirmed',
      source: 'stripe',
      createdAt: now,
      authorizedAt: now,
      captured: captured,
      capturedAt: captured ? now : null,
    };

    // ── SAVE (idempotent upsert into the 'all' list) ──
    let isNew = false;
    try {
      const store = getStore('bookings');
      let bookings = await store.get('all', { type: 'json', consistency: 'strong' });
      if (!Array.isArray(bookings)) bookings = [];

      const idx = bookings.findIndex(b => b.id === incoming.id);
      if (idx === -1) {
        bookings.push(incoming);
        isNew = true;
      } else {
        // Preserve values the admin/earlier events already set; update capture state.
        const prev = bookings[idx];
        bookings[idx] = {
          ...prev,
          ...incoming,
          createdAt: prev.createdAt || incoming.createdAt,
          authorizedAt: prev.authorizedAt || incoming.authorizedAt,
          invoiceScheduled: prev.invoiceScheduled,
          invoiceScheduledAt: prev.invoiceScheduledAt,
          balancePaid: prev.balancePaid,
          balancePaidAt: prev.balancePaidAt,
          // Only ever move captured false → true, never back.
          captured: prev.captured || captured,
          capturedAt: prev.capturedAt || (captured ? now : null),
        };
      }

      await store.setJSON('all', bookings);
      console.log(`Booking ${isNew ? 'saved' : 'updated'} (${captured ? 'captured' : 'authorized'}):`, incoming.id);
    } catch (err) {
      console.error('Failed to save booking:', err.message);
    }

    // ── FORMSPREE NOTIFICATION ──
    // Send once, when the booking is first recorded (i.e. at authorization).
    // Failure here must never break webhook delivery (we still return 200).
    if (isNew) {
      try {
        const FORMSPREE = {
          casita: 'https://formspree.io/f/mreywayn',
          boat: 'https://formspree.io/f/maqpgdle',
        };
        const endpoint = FORMSPREE[incoming.type] || FORMSPREE.casita;
        const propertyName = incoming.type === 'boat' ? 'El Jefe' : 'La Casita';
        const guestName = `${incoming.firstName || ''} ${incoming.lastName || ''}`.trim() || 'Unknown guest';

        const notifyBody = {
          _subject: `✅ Booking confirmed — ${propertyName} — ${guestName}`,
          stage: 'CONFIRMED (deposit authorized — capture manually in Stripe)',
          property: propertyName,
          guest: guestName,
          email: incoming.email,
          phone: incoming.phone,
          message: incoming.message,
          checkin: incoming.checkin,
          checkout: incoming.checkout,
          nights: incoming.nights,
          days: incoming.days,
          casitaCheckin: incoming.casitaCheckin,
          casitaCheckout: incoming.casitaCheckout,
          guests: incoming.guests,
          subtotal: incoming.subtotal,
          cleaningFee: incoming.cleaningFee,
          iva: incoming.iva,
          total: incoming.total,
          depositPaid: incoming.amount,
          balance: incoming.balance,
          stripePaymentIntent: incoming.id,
          nextStep: 'Capture this payment in Stripe Dashboard',
          timestamp: incoming.createdAt,
        };

        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(notifyBody),
        });
      } catch (err) {
        console.warn('Formspree confirmation notification failed:', err.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
