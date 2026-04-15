exports.handler = async function(event) {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!siteId || !token) {
    return { statusCode: 200, body: JSON.stringify({ casita: [], boat: [] }) };
  }

  try {
    const baseUrl = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings`;
    const headers = { 'Authorization': `Bearer ${token}` };

    let bookings = [];
    let blocks = [];

    const bookingsRes = await fetch(`${baseUrl}/all`, { headers });
    if (bookingsRes.ok) {
      const text = await bookingsRes.text();
      try { bookings = JSON.parse(text); } catch(e) { bookings = []; }
    }

    const blocksRes = await fetch(`${baseUrl}/blocks`, { headers });
    if (blocksRes.ok) {
      const text = await blocksRes.text();
      try { blocks = JSON.parse(text); } catch(e) { blocks = []; }
    }

    // Build sets of blocked date strings for each property
    function getDatesInRange(checkin, checkout) {
      const dates = [];
      const start = new Date(checkin + 'T00:00:00');
      const end = checkout ? new Date(checkout + 'T00:00:00') : new Date(checkin + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }
      return dates;
    }

    const casitaDates = new Set();
    const boatDates = new Set();

    bookings.forEach(b => {
      const dates = getDatesInRange(b.checkin, b.checkout);
      if (b.type === 'casita') dates.forEach(d => casitaDates.add(d));
      if (b.type === 'boat') dates.forEach(d => boatDates.add(d));
    });

    blocks.forEach(b => {
      const dates = getDatesInRange(b.checkin, b.checkout);
      if (b.type === 'casita') dates.forEach(d => casitaDates.add(d));
      if (b.type === 'boat') dates.forEach(d => boatDates.add(d));
    });

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        casita: Array.from(casitaDates),
        boat: Array.from(boatDates),
      }),
    };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ casita: [], boat: [] }) };
  }
};
