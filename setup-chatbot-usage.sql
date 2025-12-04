-- Create chatbot_usage table to track daily question limits per user
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS chatbot_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  question_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, usage_date)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chatbot_usage_user_date ON chatbot_usage(user_id, usage_date);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chatbot_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on row update
CREATE TRIGGER update_chatbot_usage_timestamp
  BEFORE UPDATE ON chatbot_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_chatbot_usage_updated_at();

