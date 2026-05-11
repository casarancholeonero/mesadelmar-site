// Try multiple ways to access blobs and report what works
const blobs = require('@netlify/blobs');

const SITE_ID = 'cb8ea563-05dc-4e13-8d42-0e1ad838699f';

exports.handler = async function(event) {
  const adminKey = event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const token = process.env.NETLIFY_AUTH_TOKEN;
  const results = {};

  // Method 1: getStore('bookings') - relies on auto-injected env
  try {
    const store = blobs.getStore('bookings');
    const data = await store.get('all', { type: 'json' });
    results.method1_autoContext = { 
      success: true, 
      hasData: data != null,
      isArray: Array.isArray(data),
      length: Array.isArray(data) ? data.length : null,
    };
  } catch (e) {
    results.method1_autoContext = { error: e.message };
  }

  // Method 2: getStore with explicit siteID and token (PAT)
  try {
    const store = blobs.getStore({ name: 'bookings', siteID: SITE_ID, token });
    const data = await store.get('all', { type: 'json' });
    results.method2_explicitPAT = { 
      success: true,
      hasData: data != null,
      isArray: Array.isArray(data),
      length: Array.isArray(data) ? data.length : null,
    };
  } catch (e) {
    results.method2_explicitPAT = { error: e.message };
  }

  // Method 3: getDeployStore - newer SDK function for deploy-scoped stores
  try {
    if (blobs.getDeployStore) {
      const store = blobs.getDeployStore('bookings');
      const data = await store.get('all', { type: 'json' });
      results.method3_deployStore = { 
        success: true,
        hasData: data != null,
        isArray: Array.isArray(data),
      };
    } else {
      results.method3_deployStore = { available: false };
    }
  } catch (e) {
    results.method3_deployStore = { error: e.message };
  }

  // Method 4: List SDK exports to see what's available
  results.sdkExports = Object.keys(blobs);

  // Method 5: List env vars that might give blob context
  const envVars = Object.keys(process.env)
    .filter(k => k.startsWith('NETLIFY') || k.startsWith('BLOB') || k.includes('BLOB'))
    .reduce((acc, k) => {
      acc[k] = process.env[k] ? `set (len=${process.env[k].length})` : 'empty';
      return acc;
    }, {});
  results.envVars = envVars;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results, null, 2),
  };
};
