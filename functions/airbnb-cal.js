exports.handler = async function () {
  const ICAL_URL = 'https://www.airbnb.com/calendar/ical/21548101.ics?t=6f97db20045143bc9dbca26aa4ff086e';

  try {
    const response = await fetch(ICAL_URL);
    if (!response.ok) {
      return { statusCode: 502, body: `Upstream error: ${response.status}` };
    }
    const body = await response.text();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
      body,
    };
  } catch (err) {
    return { statusCode: 500, body: `Failed to fetch calendar: ${err.message}` };
  }
};
