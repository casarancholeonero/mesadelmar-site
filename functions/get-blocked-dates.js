// get-blocked-dates.js
// PUBLIC endpoint (no auth) — used by the booking website to show which
// dates are unavailable for each property.
//
// Booking data is read DIRECTLY FROM STRIPE (the same source admin.html uses
// via get-stripe-bookings.js), not from Netlify Blobs. This keeps the public
// calendar and the admin dashboard permanently in sync with each other —
// there's no separate webhook-fed store that can silently drift out of date
// if a Stripe webhook delivery is ever missed or misconfigured.
//
// Manual owner blocks still come from Netlify Blobs — they have no Stripe
// counterpart, since the owner sets them directly in the dashboard.
//
// Fails "open" (returns empty arrays) so the public site never hard-breaks.

const Stripe = require('stripe');
const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async function (event) {
  connectLambda(event);

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // Pull recent payment intents — same pagination approach as get-stripe-bookings.js.
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

    // Same "looks like a real, active booking" filter as get-stripe-bookings.js,
    // plus excluding cancelled bookings (cancel-booking.js flags these in Stripe
    // metadata rather than removing the PaymentIntent itself).
    const bookings = allIntents
      .filter(pi => {
        if (!pi.metadata || !pi.metadata.checkin) return false;
        if (pi.status === 'canceled') return false;
        if (pi.status === 'requires_payment_method') return false;
        if (pi.metadata.cancelled === 'true') return false;
        return true;
      })
      .map(pi => ({
        type: pi.metadata.type || 'casita',
        checkin: pi.metadata.checkin || '',
        checkout: pi.metadata.checkout || '',
      }));

    // Manual owner blocks — best-effort; don't fail the whole response if
    // Blobs is unreachable, since real Stripe bookings are the important part.
    let blocks = [];
    try {
      const store = getStore('bookings');
      const stored = await store.get('blocks', { type: 'json' });
      if (Array.isArray(stored)) blocks = stored;
    } catch (err) {
      // no-op — fall through with blocks = []
    }

    // Bookings vs. manual blocks use DIFFERENT end-date conventions:
    //   • Bookings  — checkout is the morning AFTER the stay/charter ends
    //     (casita: nights = checkout − checkin; boat: last on-water day = checkout − 1).
    //     So the checkout day itself is NOT occupied and must stay bookable.
    //   • Manual blocks — the owner picked explicit From/To dates to hold, so
    //     BOTH ends are blocked (inclusive).
    function getDatesInRange(checkin, checkout, endInclusive) {
      const dates = [];
      if (!checkin) return dates;
      const start = new Date(checkin + 'T00:00:00');
      let end;
      if (checkout) {
        end = new Date(checkout + 'T00:00:00');
        if (!endInclusive) end.setDate(end.getDate() - 1); // checkout day stays free
      } else {
        end = new Date(start);
      }
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }
      return dates;
    }

    const casitaDates = new Set();
    const boatDates = new Set();

    bookings.forEach(b => {
      const dates = getDatesInRange(b.checkin, b.checkout, false); // checkout day free
      if (b.type === 'casita') dates.forEach(d => casitaDates.add(d));
      if (b.type === 'boat') dates.forEach(d => boatDates.add(d));
    });

    blocks.forEach(b => {
      const dates = getDatesInRange(b.checkin, b.checkout, true); // From/To inclusive
      if (b.type === 'casita') dates.forEach(d => casitaDates.add(d));
      if (b.type === 'boat') dates.forEach(d => boatDates.add(d));
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({
        casita: Array.from(casitaDates),
        boat: Array.from(boatDates),
      }),
    };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ casita: [], boat: [] }) };
  }
};
