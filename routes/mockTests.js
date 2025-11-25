import express from 'express';
import pool from '../db.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Save mock test result (protected route)
router.post('/save', authMiddleware, async (req, res) => {
  try {
    console.log('🔥 MOCK TEST SAVE ROUTE HIT');
    console.log('Request body:', req.body);
    console.log('User from token:', req.user);
    
    const { correct_count, total_questions, percentage, passed, time_taken_seconds, time_remaining_seconds } = req.body;
    const user_id = req.user.user_id || req.user.id;

    console.log('Extracted user_id:', user_id);

    // Validate required fields
    if (correct_count === undefined || total_questions === undefined || percentage === undefined || passed === undefined) {
      console.error('Missing required fields');
      return res.status(400).json({ error: 'Missing required fields', received: req.body });
    }

    if (!user_id) {
      console.error('No user_id found in token');
      return res.status(400).json({ error: 'User ID not found in token', user: req.user });
    }

    console.log('Attempting to insert:', { user_id, correct_count, total_questions, percentage, passed });

    // Insert the test result
    const result = await pool.query(
      `INSERT INTO mock_test_results 
       (user_id, correct_count, total_questions, percentage, passed, time_taken_seconds, time_remaining_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user_id, correct_count, total_questions, percentage, passed, time_taken_seconds || null, time_remaining_seconds || null]
    );

    console.log('✅ Test result saved successfully:', result.rows[0]);

    res.json({
      message: 'Test result saved successfully',
      result: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Error saving mock test result:', err);
    console.error('Error details:', err.message);
    console.error('Error stack:', err.stack);
    res.status(500).json({ error: 'Failed to save test result', details: err.message });
  }
});

// Get user's mock test results (protected route)
router.get('/results', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.user_id || req.user.id;
    const limit = parseInt(req.query.limit) || 50; // Default to 50 most recent

    const result = await pool.query(
      `SELECT * FROM mock_test_results 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [user_id, limit]
    );

    res.json({
      results: result.rows,
      count: result.rows.length
    });

  } catch (err) {
    console.error('Error fetching mock test results:', err);
    res.status(500).json({ error: 'Failed to fetch test results', details: err.message });
  }
});

// Get user's test statistics (protected route)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.user_id || req.user.id;

    // Get total tests, average score, best score, pass rate
    const stats = await pool.query(
      `SELECT 
        COUNT(*) as total_tests,
        AVG(percentage) as average_percentage,
        MAX(percentage) as best_percentage,
        MAX(correct_count) as best_score,
        COUNT(*) FILTER (WHERE passed = true) as passed_tests,
        COUNT(*) FILTER (WHERE passed = false) as failed_tests
       FROM mock_test_results 
       WHERE user_id = $1`,
      [user_id]
    );

    const statsData = stats.rows[0];
    
    res.json({
      total_tests: parseInt(statsData.total_tests) || 0,
      average_percentage: statsData.average_percentage ? Math.round(parseFloat(statsData.average_percentage)) : null,
      best_percentage: statsData.best_percentage ? parseInt(statsData.best_percentage) : null,
      best_score: statsData.best_score ? parseInt(statsData.best_score) : null,
      passed_tests: parseInt(statsData.passed_tests) || 0,
      failed_tests: parseInt(statsData.failed_tests) || 0,
      pass_rate: statsData.total_tests > 0 
        ? Math.round((parseInt(statsData.passed_tests) / parseInt(statsData.total_tests)) * 100)
        : null
    });

  } catch (err) {
    console.error('Error fetching test statistics:', err);
    res.status(500).json({ error: 'Failed to fetch statistics', details: err.message });
  }
});

export default router;

