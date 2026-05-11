const SITE_ID = 'cb8ea563-05dc-4e13-8d42-0e1ad838699f';

exports.handler = async function(event) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing NETLIFY_AUTH_TOKEN' }) };
  }

  const headers = { 'Authorization': `Bearer ${token}` };
  const tests = {};

  // Test 1: GET on the all blob (what we've been doing)
  try {
    const r = await fetch(`https://api.netlify.com/api/v1/blobs/${SITE_ID}/bookings/all`, { headers });
    const t = await r.text();
    tests.getAllBlob = { status: r.status, body: t.substring(0, 200) };
  } catch (e) { tests.getAllBlob = { error: e.message }; }

  // Test 2: List the store
  try {
    const r = await fetch(`https://api.netlify.com/api/v1/blobs/${SITE_ID}/bookings`, { headers });
    const t = await r.text();
    tests.listStore = { status: r.status, body: t.substring(0, 300) };
  } catch (e) { tests.listStore = { error: e.message }; }

  // Test 3: User info to verify the token is valid
  try {
    const r = await fetch(`https://api.netlify.com/api/v1/user`, { headers });
    const t = await r.text();
    tests.userInfo = { status: r.status, body: t.substring(0, 150) };
  } catch (e) { tests.userInfo = { error: e.message }; }

  // Test 4: Site info to verify token access to THIS site
  try {
    const r = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}`, { headers });
    const t = await r.text();
    tests.siteInfo = { status: r.status, body: t.substring(0, 200) };
  } catch (e) { tests.siteInfo = { error: e.message }; }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenPrefix: token.substring(0, 10), siteId: SITE_ID, tests }, null, 2),
  };
};
