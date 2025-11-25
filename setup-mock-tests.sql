-- Create mock_test_results table for storing mock test results
-- Run this in your Railway PostgreSQL database

CREATE TABLE IF NOT EXISTS mock_test_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  correct_count INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  percentage INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  time_taken_seconds INTEGER,
  time_remaining_seconds INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_mock_test_results_user_id ON mock_test_results(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_test_results_created_at ON mock_test_results(created_at DESC);

-- Optional: Add a composite index for user + date queries
CREATE INDEX IF NOT EXISTS idx_mock_test_results_user_created ON mock_test_results(user_id, created_at DESC);

