import dotenv from "dotenv";
dotenv.config();
import express from 'express';
import OpenAI from 'openai';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Initialize OpenAI client lazily (only when needed)
function getOpenAIClient() {
  if (!OpenAI) {
    throw new Error('OpenAI package is not available. Please install it: npm install openai');
  }
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  
  // Trim whitespace and remove quotes if present
  const apiKey = process.env.OPENAI_API_KEY.trim().replace(/^["']|["']$/g, '');
  
  // Validate key format (should start with sk-)
  if (!apiKey.startsWith('sk-')) {
    console.error('⚠️ API key does not start with "sk-"');
    throw new Error('Invalid API key format. Key should start with "sk-"');
  }
  
  console.log('🔑 Using API key with length:', apiKey.length, 'prefix:', apiKey.substring(0, 7));
  
  return new OpenAI({
    apiKey: apiKey,
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
  const rawKey = process.env.OPENAI_API_KEY;
  const hasKey = !!rawKey;
  
  let keyInfo = {
    hasKey: false,
    rawLength: 0,
    trimmedLength: 0,
    rawPrefix: 'N/A',
    trimmedPrefix: 'N/A',
    hasQuotes: false,
    hasWhitespace: false,
    isValidFormat: false
  };
  
  if (rawKey) {
    const trimmed = rawKey.trim().replace(/^["']|["']$/g, '');
    keyInfo = {
      hasKey: true,
      rawLength: rawKey.length,
      trimmedLength: trimmed.length,
      rawPrefix: rawKey.substring(0, Math.min(10, rawKey.length)),
      trimmedPrefix: trimmed.substring(0, Math.min(10, trimmed.length)),
      hasQuotes: rawKey.startsWith('"') || rawKey.startsWith("'") || rawKey.endsWith('"') || rawKey.endsWith("'"),
      hasWhitespace: rawKey !== rawKey.trim(),
      isValidFormat: trimmed.startsWith('sk-')
    };
  }
  
  console.log('API Key check:', keyInfo);
  
  res.json({
    configured: hasKey,
    keyInfo: keyInfo,
    message: hasKey 
      ? (keyInfo.isValidFormat ? 'OpenAI API key is configured and formatted correctly' : 'OpenAI API key is configured but format may be invalid')
      : 'OpenAI API key is NOT configured'
  });
});

// POST /chatbot/message - Send message to chatbot (protected route)
router.post('/message', authMiddleware, async (req, res) => {
  console.log('🔥 CHATBOT MESSAGE ROUTE HIT');
  console.log("🔍 OPENAI key from Railway:", process.env.OPENAI_API_KEY ? "FOUND" : "MISSING");
  console.log("🔍 First 10 chars:", process.env.OPENAI_API_KEY?.substring(0,10));

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

    // Get OpenAI client
    const openai = getOpenAIClient();

    // 🆕 --- CALL OPENAI USING THE UPDATED RESPONSES API ---
    const response = await openai.responses.create({
      model: "gpt-4.1-mini", // modern model (better + cheaper)
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory,
        { role: "user", content: message.trim() }
      ],
      max_output_tokens: 500,
      temperature: 0.7
    });

    // ⬇️ YOUR aiResponse VARIABLE STILL EXISTS
    const aiResponse = response.output_text;

    console.log('✅ Chatbot response generated successfully');

    return res.json({
      response: aiResponse,
      model: "gpt-4.1-mini"
    });

  } catch (err) {
    console.error('❌ Error in chatbot route:', err);

    if (err.message?.includes('OPENAI_API_KEY')) {
      return res.status(503).json({
        error: 'Chatbot service is not configured. OPENAI_API_KEY is missing.',
        details: 'Check Railway environment variables.'
      });
    }

    if (err.status === 401 || err.message?.includes('Invalid API key')) {
      return res.status(500).json({
        error: 'Invalid API key. Please check your OpenAI API configuration.',
        details: err.message
      });
    }

    if (err.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again shortly.',
        details: err.message
      });
    }

    return res.status(500).json({
      error: 'Failed to get chatbot response',
      details: err.message || 'Unknown error occurred'
    });
  }
});


export default router;

