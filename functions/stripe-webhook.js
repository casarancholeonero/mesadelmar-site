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

  // Listen for both authorization (manual-capture flow) and final capture.
  // - 'payment_intent.amount_capturable_updated' fires the moment a card is
  //   authorized for our $X amount with capture_method:manual. This is when
  //   we actually want to record the booking — the guest has done their part.
  // - 'payment_intent.succeeded' still fires later when we manually capture
  //   in Stripe Dashboard. We ignore it here to avoid double-recording.
  if (stripeEvent.type === 'payment_intent.amount_capturable_updated') {
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
      // Use raw HTTP API for Netlify Blobs (same pattern as get-bookings.js).
      // The @netlify/blobs SDK won't auto-detect the environment in this
      // function context, so we go directly to the HTTP API which works.
      const siteId = process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN;

      if (!siteId || !token) {
        console.error('Cannot save booking: missing env vars',
          { hasSiteId: !!siteId, hasToken: !!token });
      } else {
        const baseUrl = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings`;
        const headers = { 'Authorization': `Bearer ${token}` };

        // Read existing bookings list
        let bookings = [];
        const readRes = await fetch(`${baseUrl}/all`, { headers });
        if (readRes.ok) {
          const text = await readRes.text();
          try { bookings = JSON.parse(text); } catch(_) { bookings = []; }
          if (!Array.isArray(bookings)) bookings = [];
        }

        // Append the new booking and write the whole list back
        bookings.push(booking);
        const writeRes = await fetch(`${baseUrl}/all`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(bookings),
        });

        if (!writeRes.ok) {
          const errText = await writeRes.text().catch(() => '');
          console.error('Failed to save booking — HTTP',
            writeRes.status, errText);
        } else {
          console.log('Booking saved:', booking.id);
        }
      }
    } catch (err) {
      console.error('Failed to save booking:', err.message);
    }

    // ── FORMSPREE NOTIFICATION (booking confirmed) ──
    // Fires after Stripe confirms the deposit was authorized successfully.
    // Failure here must never break webhook delivery (we still return 200).
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
