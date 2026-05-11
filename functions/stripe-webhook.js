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
    const meta = paymentIntent.metadata;

    const num = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const booking = {
      id: paymentIntent.id,
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
      amount: paymentIntent.amount / 100,
      subtotal: num(meta.subtotal),
      cleaningFee: num(meta.cleaningFee),
      iva: num(meta.iva),
      total: num(meta.total),
      balance: num(meta.balance),
      invoiceScheduled: false,
      invoiceScheduledAt: null,
      balancePaid: false,
      balancePaidAt: null,
      status: 'confirmed',
      source: 'stripe',
      createdAt: new Date().toISOString(),
    };

    try {
      const siteId = process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN;

      console.log('DEBUG: siteId =', siteId);
      console.log('DEBUG: hasToken =', !!token);

      if (!siteId || !token) {
        console.error('Cannot save booking: missing env vars',
          { hasSiteId: !!siteId, hasToken: !!token });
      } else {
        const baseUrl = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings`;
        const headers = { 'Authorization': `Bearer ${token}` };

        console.log('DEBUG: baseUrl =', baseUrl);

        let bookings = [];
        const readRes = await fetch(`${baseUrl}/all`, { headers });
        console.log('DEBUG: read status =', readRes.status);
        if (readRes.ok) {
          const text = await readRes.text();
          console.log('DEBUG: existing bookings text length =', text.length);
          try { bookings = JSON.parse(text); } catch(_) { bookings = []; }
          if (!Array.isArray(bookings)) bookings = [];
        }
        console.log('DEBUG: bookings count before push =', bookings.length);

        bookings.push(booking);
        const writeBody = JSON.stringify(bookings);
        console.log('DEBUG: write body length =', writeBody.length);

        const writeRes = await fetch(`${baseUrl}/all`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: writeBody,
        });

        console.log('DEBUG: write status =', writeRes.status);
        const writeRespText = await writeRes.text().catch(() => '');
        console.log('DEBUG: write response body =', writeRespText.substring(0, 500));

        if (!writeRes.ok) {
          console.error('Failed to save booking — HTTP',
            writeRes.status, writeRespText);
        } else {
          console.log('Booking saved:', booking.id);
        }
      }
    } catch (err) {
      console.error('Failed to save booking:', err.message);
    }

    try {
      const FORMSPREE = {
        casita: 'https://formspree.io/f/mreywayn',
        boat:   'https://formspree.io/f/maqpgdle',
      };
      const endpoint = FORMSPREE[booking.type] || FORMSPREE.casita;
      const propertyName = booking.type === 'boat' ? 'El Jefe' : 'La Casita';
      const guestName = `${booking.firstName || ''} ${booking.lastName || ''}`.trim() || 'Unknown guest';

      const notifyBody = {
        _subject: `✅ Booking confirmed — ${propertyName} — ${guestName}`,
        stage: 'CONFIRMED (deposit authorized — capture manually in Stripe)',
        property: propertyName,
        guest: guestName,
        email: booking.email,
        phone: booking.phone,
        message: booking.message,
        checkin: booking.checkin,
        checkout: booking.checkout,
        nights: booking.nights,
        days: booking.days,
        casitaCheckin: booking.casitaCheckin,
        casitaCheckout: booking.casitaCheckout,
        guests: booking.guests,
        subtotal: booking.subtotal,
        cleaningFee: booking.cleaningFee,
        iva: booking.iva,
        total: booking.total,
        depositPaid: booking.amount,
        balance: booking.balance,
        stripePaymentIntent: booking.id,
        nextStep: 'Capture this payment in Stripe Dashboard',
        timestamp: booking.createdAt,
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
