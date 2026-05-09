const Stripe = require('stripe');

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const data = JSON.parse(event.body);
    const amount = parseInt(data.amount); // amount in dollars
    const amountInCents = amount * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      capture_method: 'manual', // authorize only, capture manually later
      metadata: {
        // Core booking info
        type: data.type || 'casita',
        checkin: data.checkin || '',
        checkout: data.checkout || '',
        nights: data.nights || '',
        guests: data.guests || '',

        // Guest contact
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        phone: data.phone || '',
        message: (data.message || '').slice(0, 500), // Stripe metadata 500-char limit

        // Pricing breakdown
        // Casita: subtotal (nights x rate) + cleaningFee = total; deposit = 50% of subtotal
        // Boat:   subtotal (days x rate)  + iva         = total; deposit = 50% of subtotal
        subtotal: data.subtotal || '',
        cleaningFee: data.cleaningFee || '',
        iva: data.iva || '',
        total: data.total || '',
        balance: data.balance || '',

        // Boat-specific
        days: data.days || '',
        casitaCheckin: data.casitaCheckin || '',
        casitaCheckout: data.casitaCheckout || '',
      },
      receipt_email: data.email || null,
    });

    // ── FORMSPREE NOTIFICATION (booking attempt) ──
    // Fires the moment a guest clicks "Request & Pay Deposit" — even if they
    // abandon the card-entry step or get a stuck spinner. Failure here must
    // never block the response to the guest.
    const FORMSPREE = {
      casita: 'https://formspree.io/f/mreywayn',
      boat:   'https://formspree.io/f/maqpgdle',
    };
    const endpoint = FORMSPREE[data.type] || FORMSPREE.casita;
    const propertyName = data.type === 'boat' ? 'El Jefe' : 'La Casita';
    const guestName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown guest';

    const notifyBody = {
      _subject: `🟡 Booking attempt — ${propertyName} — ${guestName}`,
      stage: 'ATTEMPT (deposit not yet captured)',
      property: propertyName,
      guest: guestName,
      email: data.email || '',
      phone: data.phone || '',
      message: data.message || '',
      checkin: data.checkin || '',
      checkout: data.checkout || '',
      nights: data.nights || '',
      days: data.days || '',
      casitaCheckin: data.casitaCheckin || '',
      casitaCheckout: data.casitaCheckout || '',
      guests: data.guests || '',
      subtotal: data.subtotal || '',
      cleaningFee: data.cleaningFee || '',
      iva: data.iva || '',
      total: data.total || '',
      deposit: amount,
      balance: data.balance || '',
      stripePaymentIntent: paymentIntent.id,
      timestamp: new Date().toISOString(),
    };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(notifyBody),
    }).catch(e => console.warn('Formspree attempt notification failed:', e.message));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };

  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
