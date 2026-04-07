const fetch = require('node-fetch');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined
    })
  });
}

const ALLOWED_EMAILS = ['PASTE_YOUR_GOOGLE_EMAIL_HERE'];

const allowedOrigins = [
  'https://planner.grasphislove.com',
  'https://rewards.grasphislove.com',
  'http://localhost:5173'
];

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  // Verify Firebase ID token
  const authHeader = event.headers.authorization || '';
  const idToken = authHeader.replace('Bearer ', '').trim();

  if (!idToken) {
    return { statusCode: 401, headers: corsHeaders, body: 'Unauthorized' };
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!ALLOWED_EMAILS.includes(decoded.email)) {
      return { statusCode: 403, headers: corsHeaders, body: 'Forbidden' };
    }
  } catch (err) {
    return { statusCode: 401, headers: corsHeaders, body: 'Unauthorized' };
  }

  try {
    const body = JSON.parse(event.body);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        ...body
      })
    });
    const data = await response.json();
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message })
    };
  }
};
