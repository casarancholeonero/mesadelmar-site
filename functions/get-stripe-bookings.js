// get-stripe-bookings.js
// Fetches all bookings directly from Stripe instead of from Netlify Blobs.
// Returns payment intents in the same shape admin.html expects.
//
// Header: x-admin-key must match ADMIN_PASSWORD env var.

const Stripe = require('stripe');

exports.handler = async function(event) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // Pull most recent payment intents. 100 is the per-page max; we paginate
    // up to a few pages to cover the realistic booking volume.
    const allIntents = [];
    let starting_after = null;
    for (let page = 0; page < 5; page++) {
      const params = { limit: 100 };
      if (starting_after) params.starting_after = starting_after;
      const result = await stripe.paymentIntents.list(params);
      allIntents.push(...result.data);
      if (!result.has_more) break;
      starting_after = result.data[result.data.length - 1].id;
    }

    // Filter to payment intents that look like real bookings (have our metadata)
    // and aren't canceled/failed.
    const num = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const mapped = allIntents
      .filter(pi => {
        // Only show payment intents that look like our bookings
        if (!pi.metadata || !pi.metadata.checkin) return false;
        // Skip canceled or fully failed ones
        if (pi.status === 'canceled') return false;
        // Skip "requires_payment_method" — incomplete attempts (no card auth)
        if (pi.status === 'requires_payment_method') return false;
        return true;
      })
      .map(pi => {
        const meta = pi.metadata || {};
        return {
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
          // Workflow flags — read from metadata so admin checkboxes
          // can persist by updating the Stripe payment intent metadata.
          invoiceScheduled: meta.invoiceScheduled === 'true',
          invoiceScheduledAt: meta.invoiceScheduledAt || null,
          balancePaid: meta.balancePaid === 'true',
          balancePaidAt: meta.balancePaidAt || null,
          // Cancellation record — written to PI metadata by cancel-booking.js
          cancelled: meta.cancelled === 'true',
          cancelledAt: meta.cancelledAt || null,
          cancelReason: meta.cancelReason || '',
          status: pi.status === 'succeeded' ? 'paid' : 'confirmed',
          source: 'stripe',
          createdAt: new Date(pi.created * 1000).toISOString(),
        };
      });

    // Active list hides cancelled bookings; cancelled are kept separately so the
    // dashboard can show them as a record.
    const bookings = mapped.filter(b => !b.cancelled);
    const cancelled = mapped.filter(b => b.cancelled);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookings, cancelled }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
