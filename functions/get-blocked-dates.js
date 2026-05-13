// get-blocked-dates.js
// Public endpoint (no auth) — returns blocked dates for the booking calendars.
// Combines two sources:
//   1. Manual blocks from Netlify Blobs (admin-added blocks for things like
//      owner stays, off-Stripe Airbnb reservations, etc.)
//   2. Confirmed bookings from Stripe (anything paid through the site)

const Stripe = require('stripe');

const SITE_ID = '7163a8ff-fc01-4cfb-a8f4-5c51ef600414';

function getDatesInRange(checkin, checkout) {
  const dates = [];
  if (!checkin) return dates;
  const start = new Date(checkin + 'T00:00:00');
  const end = checkout ? new Date(checkout + 'T00:00:00') : new Date(checkin + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

exports.handler = async function(event) {
  const casitaDates = new Set();
  const boatDates = new Set();

  // ── Source 1: Manual blocks from Netlify Blobs ──
  try {
    const token = process.env.NETLIFY_AUTH_TOKEN;
    if (token) {
      const baseUrl = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/bookings`;
      const headers = { 'Authorization': `Bearer ${token}` };

      const blocksRes = await fetch(`${baseUrl}/blocks`, { headers });
      if (blocksRes.ok) {
        const text = await blocksRes.text();
        let blocks = [];
        try { blocks = JSON.parse(text); } catch(e) { blocks = []; }
        if (Array.isArray(blocks)) {
          blocks.forEach(b => {
            const dates = getDatesInRange(b.checkin, b.checkout);
            if (b.type === 'casita') dates.forEach(d => casitaDates.add(d));
            if (b.type === 'boat')   dates.forEach(d => boatDates.add(d));
          });
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load manual blocks:', err.message);
  }

  // ── Source 2: Confirmed bookings from Stripe ──
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

      allIntents.forEach(pi => {
        const meta = pi.metadata || {};
        if (!meta.checkin) return;
        // Skip canceled and incomplete (no card auth) payment intents
        if (pi.status === 'canceled') return;
        if (pi.status === 'requires_payment_method') return;

        const dates = getDatesInRange(meta.checkin, meta.checkout);
        if (meta.type === 'casita') dates.forEach(d => casitaDates.add(d));
        if (meta.type === 'boat')   dates.forEach(d => boatDates.add(d));
      });
    }
  } catch (err) {
    console.warn('Failed to load Stripe bookings:', err.message);
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      casita: Array.from(casitaDates),
      boat: Array.from(boatDates),
    }),
  };
};
