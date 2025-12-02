-- Create table for Naas JSON data access tokens
-- Run this in your Railway/Supabase SQL Editor

-- Table for storing time-limited access tokens to naas.json data
CREATE TABLE IF NOT EXISTS naas_access_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT false,
  last_accessed_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_naas_tokens_user_id ON naas_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_naas_tokens_token ON naas_access_tokens(access_token);
CREATE INDEX IF NOT EXISTS idx_naas_tokens_expires_at ON naas_access_tokens(expires_at);

