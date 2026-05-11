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

  if (stripeEvent.type === 'payment_intent.amount_capturable_updated') {
    const paymentIntent = stripeEvent.data.object;
    const meta = paymentIntent.metadata || {};

    const propertyType = meta.type || 'casita';
    const propertyName = propertyType === 'boat' ? 'El Jefe' : 'La Casita';
    const guestName = `${meta.firstName || ''} ${meta.lastName || ''}`.trim() || 'Unknown guest';

    console.log('Booking confirmed in Stripe:', paymentIntent.id, '—', propertyName, '—', guestName);

    // Formspree confirmation email
    try {
      const FORMSPREE = {
        casita: 'https://formspree.io/f/mreywayn',
        boat:   'https://formspree.io/f/maqpgdle',
      };
      const endpoint = FORMSPREE[propertyType] || FORMSPREE.casita;

      const num = (v) => {
        if (v === undefined || v === null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const notifyBody = {
        _subject: `✅ Booking confirmed — ${propertyName} — ${guestName}`,
        stage: 'CONFIRMED (deposit authorized — capture manually in Stripe)',
        property: propertyName,
        guest: guestName,
        email: meta.email || '',
        phone: meta.phone || '',
        message: meta.message || '',
        checkin: meta.checkin || '',
        checkout: meta.checkout || '',
        nights: meta.nights || '',
        days: meta.days || '',
        casitaCheckin: meta.casitaCheckin || '',
        casitaCheckout: meta.casitaCheckout || '',
        guests: meta.guests || '',
        subtotal: num(meta.subtotal),
        cleaningFee: num(meta.cleaningFee),
        iva: num(meta.iva),
        total: num(meta.total),
        depositPaid: paymentIntent.amount / 100,
        balance: num(meta.balance),
        stripePaymentIntent: paymentIntent.id,
        nextStep: 'Capture this payment in Stripe Dashboard',
        timestamp: new Date().toISOString(),
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

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
