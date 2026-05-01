const Stripe = require('stripe');

exports.handler = async function(event) {
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

  if (stripeEvent.type === 'payment_intent.succeeded') {
    const paymentIntent = stripeEvent.data.object;
    const meta = paymentIntent.metadata;

    // Helper: parse string-from-metadata into a number, or null if absent/blank
    const num = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const booking = {
      id: paymentIntent.id,
      type: meta.type || 'casita',

      // Stay dates
      checkin: meta.checkin || '',
      checkout: meta.checkout || '',
      nights: meta.nights || '',
      days: meta.days || '',                 // Boat: charter days
      casitaCheckin: meta.casitaCheckin || '',   // Boat: linked Casita stay
      casitaCheckout: meta.casitaCheckout || '',

      // Guest details
      guests: meta.guests || '',
      firstName: meta.firstName || '',
      lastName: meta.lastName || '',
      email: meta.email || '',
      phone: meta.phone || '',
      message: meta.message || '',

      // Payment + pricing
      amount: paymentIntent.amount / 100,        // deposit actually paid
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
      createdAt: new Date().toISOString(),
    };

    try {
      const { getStore } = require('@netlify/blobs');
      const store = getStore('bookings');
      const existing = await store.get('all', { type: 'json' }).catch(() => []);
      const bookings = Array.isArray(existing) ? existing : [];
      bookings.push(booking);
      await store.set('all', JSON.stringify(bookings));
      console.log('Booking saved:', booking.id);
    } catch (err) {
      console.error('Failed to save booking:', err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
