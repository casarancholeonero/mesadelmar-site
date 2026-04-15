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
        type: data.type || 'casita',
        checkin: data.checkin || '',
        checkout: data.checkout || '',
        nights: data.nights || '',
        guests: data.guests || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        phone: data.phone || '',
        message: data.message || '',
      },
      receipt_email: data.email || null,
    });

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
