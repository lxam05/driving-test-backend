-- Create waitlist table for test route email signups
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS route_waitlist (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  test_centre VARCHAR(255) NOT NULL,
  route_number INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  notified BOOLEAN DEFAULT FALSE,
  notified_at TIMESTAMP,
  discount_code VARCHAR(50),
  UNIQUE(email, test_centre)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON route_waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_centre ON route_waitlist(test_centre);
CREATE INDEX IF NOT EXISTS idx_waitlist_notified ON route_waitlist(notified);

