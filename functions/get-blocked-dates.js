// get-blocked-dates.js
// PUBLIC endpoint (no auth) — used by the booking website to show which
// dates are unavailable for each property. Reads through @netlify/blobs SDK.
// Fails "open" (returns empty arrays) so the public site never hard-breaks.

const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async function (event) {
  connectLambda(event);

  try {
    const store = getStore('bookings');

    let bookings = await store.get('all', { type: 'json' });
    let blocks = await store.get('blocks', { type: 'json' });
    if (!Array.isArray(bookings)) bookings = [];
    if (!Array.isArray(blocks)) blocks = [];

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

    const casitaDates = new Set();
    const boatDates = new Set();

    [...bookings, ...blocks].forEach(b => {
      const dates = getDatesInRange(b.checkin, b.checkout);
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
