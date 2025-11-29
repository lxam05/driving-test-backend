import express from 'express';
import Stripe from 'stripe';
import pool from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// Initialize Stripe
let stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('⚠️ STRIPE_SECRET_KEY not set in environment variables');
  } else {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
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

// POST /routes/checkout - Create Stripe Checkout Session
router.post('/checkout', authMiddleware, async (req, res) => {
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
    const price = parseInt(process.env.ROUTES_LICENSE_PRICE || '2999'); // default €29.99

    // Check if user already has active license
    const existingLicense = await hasActiveLicense(userId);
    if (existingLicense) {
      return res.status(400).json({ 
        error: 'You already have an active license',
        expiresAt: existingLicense.expires_at
      });
    }

    // Validate and format success/cancel URLs
    let successUrl = process.env.STRIPE_SUCCESS_URL || 'http://localhost:5500';
    let cancelUrl = process.env.STRIPE_CANCEL_URL || 'http://localhost:5500';

    // Ensure URLs have https:// scheme
    if (!successUrl.startsWith('http://') && !successUrl.startsWith('https://')) {
      successUrl = `https://${successUrl}`;
    }
    if (!cancelUrl.startsWith('http://') && !cancelUrl.startsWith('https://')) {
      cancelUrl = `https://${cancelUrl}`;
    }

    // Remove trailing slashes and ensure clean URL
    successUrl = successUrl.replace(/\/$/, '');
    cancelUrl = cancelUrl.replace(/\/$/, '');

    // Build final URLs
    const finalSuccessUrl = `${successUrl}/routes.html?payment=success`;
    const finalCancelUrl = `${cancelUrl}/routes.html?payment=cancelled`;

    console.log('Creating Stripe checkout session for user:', userId);
    console.log('Price:', price, 'cents (€' + (price / 100).toFixed(2) + ')');
    console.log('Success URL:', finalSuccessUrl);
    console.log('Cancel URL:', finalCancelUrl);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: '3-Month Route Access License',
              description: 'Access to all driving test routes for 3 months',
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      client_reference_id: userId.toString(),
      metadata: {
        user_id: userId.toString(),
      },
    });

    console.log('Stripe session created:', session.id);
    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    console.error('Error details:', {
      message: err.message,
      type: err.type,
      code: err.code,
      statusCode: err.statusCode
    });
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: err.message || 'Unknown error'
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

  // Handle the checkout.session.completed event
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

export default router;

