import express from 'express';
import OpenAI from 'openai';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for driving test assistance
const SYSTEM_PROMPT = `You are a helpful assistant specializing in Irish driving test preparation. You help users with:
- Irish driving test rules and regulations
- Road signs and their meanings
- Theory test questions and explanations
- Practical test tips and advice
- Test preparation strategies
- General driving knowledge for Ireland

Be concise, accurate, and friendly. Focus on providing clear, actionable information that will help users pass their driving test.`;

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

    // Handle specific OpenAI API errors
    if (err.status === 401) {
      return res.status(500).json({ error: 'Invalid API key. Please check your OpenAI API configuration.' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
    }
    if (err.status === 500) {
      return res.status(500).json({ error: 'OpenAI service error. Please try again later.' });
    }

    res.status(500).json({ 
      error: 'Failed to get chatbot response', 
      details: err.message 
    });
  }
});

export default router;

