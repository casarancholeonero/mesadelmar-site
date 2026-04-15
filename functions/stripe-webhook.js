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

    const booking = {
      id: paymentIntent.id,
      type: meta.type || 'casita',
      checkin: meta.checkin || '',
      checkout: meta.checkout || '',
      nights: meta.nights || '',
      guests: meta.guests || '',
      firstName: meta.firstName || '',
      lastName: meta.lastName || '',
      email: meta.email || '',
      phone: meta.phone || '',
      amount: paymentIntent.amount / 100,
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
