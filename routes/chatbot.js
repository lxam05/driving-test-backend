import express from 'express';
import OpenAI from 'openai';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Initialize OpenAI client lazily (only when needed)
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// System prompt for driving test assistance
const SYSTEM_PROMPT = `You are a helpful assistant specializing in Irish driving test preparation. You help users with:
- Irish driving test rules and regulations
- Road signs and their meanings
- Theory test questions and explanations
- Practical test tips and advice
- Test preparation strategies
- General driving knowledge for Ireland

Be concise, accurate, and friendly. Focus on providing clear, actionable information that will help users pass their driving test.`;

// GET /chatbot/test - Test if OpenAI API key is configured (protected route)
router.get('/test', authMiddleware, (req, res) => {
  console.log('🔥 CHATBOT TEST ROUTE HIT');
  const hasKey = !!process.env.OPENAI_API_KEY;
  const keyLength = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0;
  const keyPrefix = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 7) : 'N/A';
  
  console.log('API Key check:', {
    hasKey,
    keyLength,
    keyPrefix,
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('OPENAI'))
  });
  
  res.json({
    configured: hasKey,
    keyLength: keyLength,
    keyPrefix: keyPrefix,
    message: hasKey 
      ? 'OpenAI API key is configured' 
      : 'OpenAI API key is NOT configured'
  });
});

// POST /chatbot/message - Send message to chatbot (protected route)
router.post('/message', authMiddleware, async (req, res) => {
  console.log('🔥 CHATBOT MESSAGE ROUTE HIT');
  try {
    const { message, conversationHistory = [] } = req.body;

    // Validate message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required and must be a non-empty string' });
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error('⚠️ OPENAI_API_KEY not set in environment variables');
      return res.status(500).json({ error: 'Chatbot service is not configured' });
    }

    // Build messages array for OpenAI
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory, // Include previous conversation context
      { role: 'user', content: message.trim() }
    ];

    // Get OpenAI client (lazy initialization)
    const openai = getOpenAIClient();

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500, // Limit response length
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    console.log('✅ Chatbot response generated successfully');
    res.json({
      response: aiResponse,
      model: completion.model,
    });

  } catch (err) {
    console.error('❌ Error in chatbot route:', err);
    console.error('Error stack:', err.stack);
    console.error('Error name:', err.name);

    // Handle specific OpenAI API errors
    if (err.message && err.message.includes('OPENAI_API_KEY')) {
      return res.status(503).json({ 
        error: 'Chatbot service is not configured. OPENAI_API_KEY is missing.',
        details: 'Please check environment variables in Railway.'
      });
    }
    
    if (err.status === 401 || (err.message && err.message.includes('Invalid API key'))) {
      return res.status(500).json({ 
        error: 'Invalid API key. Please check your OpenAI API configuration.',
        details: err.message 
      });
    }
    
    if (err.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again in a moment.',
        details: err.message 
      });
    }
    
    if (err.status === 500 || (err.message && err.message.includes('OpenAI'))) {
      return res.status(500).json({ 
        error: 'OpenAI service error. Please try again later.',
        details: err.message 
      });
    }

    // Generic error response
    res.status(500).json({ 
      error: 'Failed to get chatbot response', 
      details: err.message || 'Unknown error occurred'
    });
  }
});

export default router;

