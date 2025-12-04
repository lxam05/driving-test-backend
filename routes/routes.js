import express from 'express';
import Stripe from 'stripe';
import pool from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Initialize Stripe
let stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('⚠️ STRIPE_SECRET_KEY not set in environment variables');
  } else {
    const secretKey = process.env.STRIPE_SECRET_KEY.trim();
    const keyType = secretKey.startsWith('sk_test_') ? 'TEST' : 
                   secretKey.startsWith('sk_live_') ? 'LIVE' : 'UNKNOWN';
    console.log(`🔑 Stripe Secret Key Type: ${keyType}`);
    
    stripe = new Stripe(secretKey, {
      apiVersion: '2024-11-20.acacia',
    });
    console.log('✅ Stripe initialized successfully');
  }
} catch (err) {
  console.error('❌ Failed to initialize Stripe:', err.message);
}

// Get link expiry hours from settings (default 12)
async function getLinkExpiryHours() {
  try {
    const result = await pool.query(
      'SELECT link_expiry_hours FROM route_settings WHERE id = 1'
    );
    return result.rows[0]?.link_expiry_hours || 12;
  } catch (err) {
    console.error('Error getting link expiry:', err);
    return 12; // default
  }
}

// Check if user has active license
async function hasActiveLicense(userId) {
  try {
    // Permanent access for admin users (set via ADMIN_USER_IDS env var, comma-separated)
    const adminUserIds = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
    if (adminUserIds.includes(userId.toString())) {
      console.log('✅ Admin user detected - granting permanent access:', userId);
      // Return a "permanent" license object (expires far in the future)
      return {
        expires_at: new Date('2099-12-31T23:59:59Z'),
        is_permanent: true
      };
    }
    
    // Try with is_active first, fallback to just checking expiry if column doesn't exist
    let result;
    try {
      result = await pool.query(
        `SELECT expires_at FROM route_licenses 
         WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
         ORDER BY expires_at DESC LIMIT 1`,
        [userId]
      );
    } catch (err) {
      // If is_active column doesn't exist, try without it
      if (err.message && err.message.includes('is_active')) {
        console.warn('is_active column not found, checking without it');
        result = await pool.query(
          `SELECT expires_at FROM route_licenses 
           WHERE user_id = $1 AND expires_at > NOW()
           ORDER BY expires_at DESC LIMIT 1`,
          [userId]
        );
      } else {
        throw err;
      }
    }
    return result.rows[0] || null;
  } catch (err) {
    console.error('Error checking license:', err);
    return null;
  }
}

// GET /routes/publishable-key - Get Stripe publishable key
router.get('/publishable-key', (req, res) => {
  try {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    console.log('Publishable key check:', publishableKey ? 'Key exists' : 'Key missing');
    
    if (!publishableKey) {
      console.error('STRIPE_PUBLISHABLE_KEY not set in environment variables');
      return res.status(500).json({ 
        error: 'Stripe publishable key not configured',
        details: 'STRIPE_PUBLISHABLE_KEY environment variable is missing'
      });
    }
    
    // Validate key format
    const trimmedKey = publishableKey.trim();
    if (!trimmedKey.startsWith('pk_test_') && !trimmedKey.startsWith('pk_live_')) {
      console.error('Invalid publishable key format:', trimmedKey.substring(0, 10) + '...');
      return res.status(500).json({ 
        error: 'Invalid Stripe publishable key format',
        details: 'Key must start with pk_test_ or pk_live_'
      });
    }
    
    // Check for key mismatch
    const secretKeyType = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'live';
    const publishableKeyType = trimmedKey.startsWith('pk_test_') ? 'test' : 'live';
    
    if (secretKeyType !== publishableKeyType) {
      console.error(`❌ CRITICAL: Key mismatch detected!`);
      console.error(`   Secret key is ${secretKeyType.toUpperCase()} (${process.env.STRIPE_SECRET_KEY?.substring(0, 10)}...)`);
      console.error(`   Publishable key is ${publishableKeyType.toUpperCase()} (${trimmedKey.substring(0, 10)}...)`);
      console.error(`   Both keys must be from the same environment (both test or both live)`);
      return res.status(500).json({ 
        error: 'Stripe key mismatch',
        details: `Secret key is ${secretKeyType} but publishable key is ${publishableKeyType}. Both keys must be from the same environment.`,
        fix: 'Update your Railway environment variables to use matching keys (both test or both live)'
      });
    }
    
    res.json({ publishableKey: trimmedKey });
  } catch (err) {
    console.error('Error in publishable-key endpoint:', err);
    res.status(500).json({ 
      error: 'Failed to get publishable key',
      details: err.message
    });
  }
});

// POST /routes/create-payment-intent - Create PaymentIntent for onsite payment
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    // Check if Stripe is initialized
    if (!stripe) {
      console.error('Stripe not initialized - STRIPE_SECRET_KEY missing or invalid');
      return res.status(500).json({ 
        error: 'Payment system not configured. Please contact support.',
        details: 'Stripe secret key not set'
      });
    }

    const userId = req.user.user_id;
    
    // Support custom amount (for single route vs bundle)
    // amount in cents: 299 for single route, 1399 for full bundle
    const requestedAmount = req.body.amount ? parseInt(req.body.amount) : null;
    const price = requestedAmount || parseInt(process.env.ROUTES_LICENSE_PRICE || '1399'); // default €13.99

    // Validate price
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount specified',
        details: 'Amount must be a positive number'
      });
    }

    // Only check for existing license if purchasing full bundle
    if (!requestedAmount || requestedAmount >= 1399) {
      const existingLicense = await hasActiveLicense(userId);
      if (existingLicense) {
        return res.status(400).json({ 
          error: 'You already have an active license',
          expiresAt: existingLicense.expires_at
        });
      }
    }

    console.log('Creating PaymentIntent for user:', userId);
    console.log('Price:', price, 'cents (€' + (price / 100).toFixed(2) + ')');

    // Determine product name based on amount
    const productName = price >= 1399 
      ? '3-Month Route Access License (Full Bundle)'
      : 'Single Route Access';

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: price,
      currency: 'eur',
      metadata: {
        user_id: userId.toString(),
        product: productName,
        amount: price.toString(),
        purchase_type: price >= 1399 ? 'bundle' : 'single'
      },
      automatic_payment_methods: {
        enabled: true,
      },
      description: productName,
    });

    console.log('PaymentIntent created:', paymentIntent.id);
    console.log('PaymentIntent status:', paymentIntent.status);
    console.log('Client secret exists:', !!paymentIntent.client_secret);
    console.log('PaymentIntent amount:', paymentIntent.amount);
    console.log('PaymentIntent currency:', paymentIntent.currency);
    
    if (!paymentIntent.client_secret) {
      console.error('PaymentIntent details:', JSON.stringify(paymentIntent, null, 2));
      throw new Error('PaymentIntent created but no client_secret returned');
    }

    // Verify client_secret format
    if (!paymentIntent.client_secret.includes('_secret_')) {
      console.error('Invalid client_secret format:', paymentIntent.client_secret.substring(0, 20) + '...');
      throw new Error('Invalid client_secret format returned from Stripe');
    }

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    console.error('Stripe PaymentIntent error:', err);
    console.error('Error details:', {
      message: err.message,
      type: err.type,
      code: err.code,
      statusCode: err.statusCode
    });
    res.status(500).json({ 
      error: 'Failed to create payment intent',
      details: err.message || 'Unknown error'
    });
  }
});

// POST /routes/confirm-payment - Confirm payment and create license
router.post('/confirm-payment', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID required' });
    }

    // Verify payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Check if payment belongs to this user
    if (paymentIntent.metadata.user_id !== userId.toString()) {
      return res.status(403).json({ error: 'Payment does not belong to this user' });
    }

    // Check if payment succeeded
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ 
        error: 'Payment not completed',
        status: paymentIntent.status
      });
    }

    // Check if license already exists for this payment
    const existingLicense = await pool.query(
      'SELECT id FROM route_licenses WHERE stripe_payment_intent_id = $1',
      [paymentIntentId]
    );

    if (existingLicense.rows.length > 0) {
      return res.status(400).json({ error: 'License already created for this payment' });
    }

    // Create license
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3);

    await pool.query(
      `INSERT INTO route_licenses 
       (user_id, stripe_payment_intent_id, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, paymentIntentId, expiresAt]
    );

    console.log(`License created for user ${userId} from payment ${paymentIntentId}`);
    res.json({ 
      success: true,
      message: 'License activated successfully',
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    console.error('Error confirming payment:', err);
    res.status(500).json({ 
      error: 'Failed to confirm payment',
      details: err.message
    });
  }
});

// GET /routes/license-status - Check user's license status
router.get('/license-status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const license = await hasActiveLicense(userId);

    res.json({
      hasLicense: !!license,
      expiresAt: license?.expires_at || null,
      isPermanent: license?.is_permanent || false,
    });
  } catch (err) {
    console.error('Error checking license status:', err);
    res.status(500).json({ error: 'Failed to check license status' });
  }
});

// POST /routes/generate-link - Generate time-limited link
router.post('/generate-link', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { centreName, routeNumber } = req.body;

    if (!centreName || !routeNumber) {
      return res.status(400).json({ error: 'Centre name and route number required' });
    }

    // Check for active license
    const license = await hasActiveLicense(userId);
    if (!license) {
      return res.status(403).json({ error: 'No active license. Please purchase access.' });
    }

    // Get expiry hours
    const expiryHours = await getLinkExpiryHours();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    // Generate unique token
    const linkToken = randomUUID();

    // Create link record
    const result = await pool.query(
      `INSERT INTO route_links (user_id, centre_name, route_number, link_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING link_token, expires_at`,
      [userId, centreName, routeNumber, linkToken, expiresAt]
    );

    res.json({
      linkToken: result.rows[0].link_token,
      expiresAt: result.rows[0].expires_at,
    });
  } catch (err) {
    console.error('Error generating link:', err);
    res.status(500).json({ error: 'Failed to generate link' });
  }
});

// GET /routes/validate-link/:token - Validate link token
router.get('/validate-link/:token', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { token } = req.params;

    const result = await pool.query(
      `SELECT centre_name, route_number, expires_at, is_used
       FROM route_links
       WHERE link_token = $1 AND user_id = $2`,
      [token, userId]
    );

    if (result.rows.length === 0) {
      return res.json({ valid: false, error: 'Link not found' });
    }

    const link = result.rows[0];

    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      return res.json({ valid: false, error: 'Link has expired' });
    }

    // Update last accessed
    await pool.query(
      `UPDATE route_links 
       SET last_accessed_at = NOW(), is_used = true
       WHERE link_token = $1`,
      [token]
    );

    res.json({
      valid: true,
      centreName: link.centre_name,
      routeNumber: link.route_number,
    });
  } catch (err) {
    console.error('Error validating link:', err);
    res.status(500).json({ valid: false, error: 'Failed to validate link' });
  }
});

// GET /routes/centres - Get all test centres (for dashboard)
router.get('/centres', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const license = await hasActiveLicense(userId);

    // Return all centres with route count (7 for each)
    // In a real app, this might come from a database
    const centres = [
      "Athlone", "Ballina", "Birr", "Birr (County Arms Hotel)", "Buncrana",
      "Carlow (Talbot Hotel)", "Carrick-on-Shannon", "Castlebar", "Cavan",
      "Charlestown (Dublin)", "Clifden", "Clonmel", "Cork (Ballincollig)",
      "Cork (St. Finbarr's GAA Club, Togher)", "Cork (Wilton)", "Donegal",
      "Drogheda", "Dundalk", "Dungarvan", "Dún Laoghaire / Deansgrange",
      "Ennis", "Finglas", "Galway (Carnmore)", "Galway (Westside)", "Gorey",
      "Killarney", "Kilkenny (Government Buildings)", "Kilkenny (O'Loughlin Gaels)",
      "Killester", "Kilrush", "Letterkenny", "Limerick (Castlemungret)",
      "Limerick (Woodview)", "Longford", "Loughrea", "Loughrea (Lough Rea Hotel & Spa)",
      "Mallow (Cork Racecourse, Mallow)", "Monaghan", "Mulhuddart",
      "Mulhuddart (Carlton Hotel)", "Mullingar", "Naas", "Navan", "Nenagh",
      "Newcastle West", "Newcastle West (Longcourt House Hotel)", "Portlaoise",
      "Raheny", "Roscommon", "Shannon", "Skibbereen", "Sligo", "Tallaght",
      "Thurles", "Tipperary", "Tralee", "Tuam", "Tullamore", "Waterford",
      "Wexford", "Wicklow"
    ];

    const centresWithRoutes = centres.map(name => ({
      name,
      routeCount: 7,
    }));

    res.json({
      hasLicense: !!license,
      centres: centresWithRoutes,
    });
  } catch (err) {
    console.error('Error getting centres:', err);
    res.status(500).json({ error: 'Failed to get centres' });
  }
});

// GET /routes/active-links - Get user's active links
router.get('/active-links', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `SELECT link_token, centre_name, route_number, created_at, expires_at
       FROM route_links
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ links: result.rows });
  } catch (err) {
    console.error('Error getting active links:', err);
    res.status(500).json({ error: 'Failed to get active links' });
  }
});

// POST /routes/webhook - Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle payment_intent.succeeded event (for PaymentIntent flow)
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const userId = paymentIntent.metadata.user_id;

    if (!userId) {
      console.error('No user_id in payment intent metadata');
      return res.status(400).json({ error: 'No user_id in payment intent' });
    }

    try {
      // Check if license already exists for this payment
      const existingLicense = await pool.query(
        'SELECT id FROM route_licenses WHERE stripe_payment_intent_id = $1',
        [paymentIntent.id]
      );

      if (existingLicense.rows.length > 0) {
        console.log(`License already exists for payment ${paymentIntent.id}`);
        return res.json({ received: true, message: 'License already exists' });
      }

      // Check purchase type from metadata
      const purchaseType = paymentIntent.metadata.purchase_type || 'bundle';
      const amount = parseInt(paymentIntent.amount);
      
      // For now, grant 3-month license for both bundle and single
      // Single route purchases could be handled differently in the future
      const expiresAt = new Date();
      if (purchaseType === 'bundle' || amount >= 1399) {
        expiresAt.setMonth(expiresAt.getMonth() + 3);
      } else {
        // Single route - grant 30-day access (or could be handled differently)
        expiresAt.setDate(expiresAt.getDate() + 30);
      }

      // Create license record
      await pool.query(
        `INSERT INTO route_licenses 
         (user_id, stripe_payment_intent_id, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, paymentIntent.id, expiresAt]
      );

      console.log(`License created for user ${userId} from webhook`);
    } catch (err) {
      console.error('Error creating license from webhook:', err);
      return res.status(500).json({ error: 'Failed to create license' });
    }
  }

  // Also handle checkout.session.completed for backwards compatibility
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id; // UUID, not integer

    if (!userId) {
      console.error('No user_id in session');
      return res.status(400).json({ error: 'No user_id in session' });
    }

    try {
      // Calculate expiry (3 months from now)
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 3);

      // Create license record
      await pool.query(
        `INSERT INTO route_licenses 
         (user_id, stripe_payment_intent_id, stripe_checkout_session_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, session.payment_intent, session.id, expiresAt]
      );

      console.log(`License created for user ${userId}`);
    } catch (err) {
      console.error('Error creating license:', err);
      return res.status(500).json({ error: 'Failed to create license' });
    }
  }

  res.json({ received: true });
});

// GET /routes/settings - Get route settings (optional, for admin)
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT link_expiry_hours FROM route_settings WHERE id = 1');
    res.json({ linkExpiryHours: result.rows[0]?.link_expiry_hours || 12 });
  } catch (err) {
    console.error('Error getting settings:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// POST /routes/generate-naas-token - Generate 30-minute access token for Naas routes
router.post('/generate-naas-token', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Check for active license
    const license = await hasActiveLicense(userId);
    if (!license) {
      return res.status(403).json({ error: 'No active license. Please purchase access.' });
    }

    // Generate unique token
    const accessToken = randomUUID();

    // Set expiry to 30 minutes from now
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    // Create token record
    await pool.query(
      `INSERT INTO naas_access_tokens (user_id, access_token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, accessToken, expiresAt]
    );

    console.log(`Naas access token generated for user ${userId}, expires at ${expiresAt.toISOString()}`);

    res.json({
      accessToken,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Error generating Naas token:', err);
    res.status(500).json({ error: 'Failed to generate access token' });
  }
});

// GET /routes/naas-data/:token - Get Naas route data (without actual links)
router.get('/naas-data/:token', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { token } = req.params;

    // Validate token
    const result = await pool.query(
      `SELECT user_id, expires_at, is_used
       FROM naas_access_tokens
       WHERE access_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const tokenData = result.rows[0];

    // Check if token belongs to this user
    if (tokenData.user_id !== userId) {
      return res.status(403).json({ error: 'Token does not belong to this user' });
    }

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Access token has expired' });
    }

    // Load naas.json file
    let naasData;
    try {
      const filePath = join(__dirname, '../data/naas.json');
      const fileContent = readFileSync(filePath, 'utf-8');
      naasData = JSON.parse(fileContent);
    } catch (err) {
      console.error('Error reading naas.json:', err);
      return res.status(500).json({ error: 'Failed to load route data' });
    }

    // Return data without actual links - replace with proxy endpoints
    const routesWithoutLinks = naasData.routes.map(route => ({
      id: route.id,
      name: route.name,
      // Don't include the actual link - frontend will use proxy endpoint
    }));

    // Update last accessed
    await pool.query(
      `UPDATE naas_access_tokens 
       SET last_accessed_at = NOW(), is_used = true
       WHERE access_token = $1`,
      [token]
    );

    res.json({
      location: naasData.location,
      routes: routesWithoutLinks,
      expiresAt: tokenData.expires_at,
    });
  } catch (err) {
    console.error('Error getting Naas data:', err);
    res.status(500).json({ error: 'Failed to get route data' });
  }
});

// POST /routes/generate-tallaght-token - Generate 30-minute access token for Tallaght routes
router.post('/generate-tallaght-token', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Check for active license
    const license = await hasActiveLicense(userId);
    if (!license) {
      return res.status(403).json({ error: 'No active license. Please purchase access.' });
    }

    // Generate unique token
    const accessToken = randomUUID();

    // Set expiry to 30 minutes from now
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    // Create token record (reuse naas_access_tokens table for simplicity)
    await pool.query(
      `INSERT INTO naas_access_tokens (user_id, access_token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, accessToken, expiresAt]
    );

    console.log(`Tallaght access token generated for user ${userId}, expires at ${expiresAt.toISOString()}`);

    res.json({
      accessToken,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Error generating Tallaght token:', err);
    res.status(500).json({ error: 'Failed to generate access token' });
  }
});

// GET /routes/tallaght-data/:token - Get Tallaght route data (without actual links)
router.get('/tallaght-data/:token', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { token } = req.params;

    // Validate token
    const result = await pool.query(
      `SELECT user_id, expires_at, is_used
       FROM naas_access_tokens
       WHERE access_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const tokenData = result.rows[0];

    // Check if token belongs to this user
    if (tokenData.user_id !== userId) {
      return res.status(403).json({ error: 'Token does not belong to this user' });
    }

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Access token has expired' });
    }

    // Load tallaght.json file
    let tallaghtData;
    try {
      const filePath = join(__dirname, '../data/tallaght.json');
      const fileContent = readFileSync(filePath, 'utf-8');
      tallaghtData = JSON.parse(fileContent);
    } catch (err) {
      console.error('Error reading tallaght.json:', err);
      return res.status(500).json({ error: 'Failed to load route data' });
    }

    // Return data without actual links
    const routesWithoutLinks = tallaghtData.routes.map(route => ({
      id: route.id,
      name: route.name,
    }));

    // Update last accessed
    await pool.query(
      `UPDATE naas_access_tokens 
       SET last_accessed_at = NOW(), is_used = true
       WHERE access_token = $1`,
      [token]
    );

    res.json({
      location: tallaghtData.location,
      routes: routesWithoutLinks,
      expiresAt: tokenData.expires_at,
    });
  } catch (err) {
    console.error('Error getting Tallaght data:', err);
    res.status(500).json({ error: 'Failed to get route data' });
  }
});

// GET /routes/tallaght-route/:token/:routeId - Proxy endpoint that redirects to actual Google Maps link
router.get('/tallaght-route/:token/:routeId', async (req, res) => {
  try {
    const { token, routeId } = req.params;

    // Validate token
    const tokenResult = await pool.query(
      `SELECT user_id, expires_at
       FROM naas_access_tokens
       WHERE access_token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const tokenData = tokenResult.rows[0];

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Access token has expired' });
    }

    // Load tallaght.json file
    let tallaghtData;
    try {
      const filePath = join(__dirname, '../data/tallaght.json');
      const fileContent = readFileSync(filePath, 'utf-8');
      tallaghtData = JSON.parse(fileContent);
    } catch (err) {
      console.error('Error reading tallaght.json:', err);
      return res.status(500).json({ error: 'Failed to load route data' });
    }

    // Find the route
    const route = tallaghtData.routes.find(r => r.id === parseInt(routeId));
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Redirect directly to Google Maps - link never exposed in frontend
    res.redirect(302, route.link);
  } catch (err) {
    console.error('Error accessing Tallaght route:', err);
    res.status(500).json({ error: 'Failed to access route' });
  }
});

// GET /routes/naas-route/:token/:routeId - Proxy endpoint that redirects to actual Google Maps link
// Note: No authMiddleware needed - access token in URL is sufficient security
router.get('/naas-route/:token/:routeId', async (req, res) => {
  try {
    const { token, routeId } = req.params;

    // Validate token
    const tokenResult = await pool.query(
      `SELECT user_id, expires_at
       FROM naas_access_tokens
       WHERE access_token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const tokenData = tokenResult.rows[0];

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Access token has expired' });
    }

    // Load naas.json file
    let naasData;
    try {
      const filePath = join(__dirname, '../data/naas.json');
      const fileContent = readFileSync(filePath, 'utf-8');
      naasData = JSON.parse(fileContent);
    } catch (err) {
      console.error('Error reading naas.json:', err);
      return res.status(500).json({ error: 'Failed to load route data' });
    }

    // Find the route
    const route = naasData.routes.find(r => r.id === parseInt(routeId));
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Redirect directly to Google Maps - link never exposed in frontend
    res.redirect(302, route.link);
  } catch (err) {
    console.error('Error accessing Naas route:', err);
    res.status(500).json({ error: 'Failed to access route' });
  }
});

export default router;

