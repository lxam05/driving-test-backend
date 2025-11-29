-- Create tables for route licenses and time-limited links
-- Run this in your Railway/Supabase SQL Editor

-- Table for storing user route licenses (3-month access)
CREATE TABLE IF NOT EXISTS route_licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_checkout_session_id VARCHAR(255) UNIQUE,
  purchased_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table for storing time-limited route links
CREATE TABLE IF NOT EXISTS route_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  centre_name VARCHAR(255) NOT NULL,
  route_number INTEGER NOT NULL,
  link_token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT false,
  last_accessed_at TIMESTAMP
);

-- Table for route settings (admin configurable)
CREATE TABLE IF NOT EXISTS route_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  link_expiry_hours INTEGER DEFAULT 12,
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default settings
INSERT INTO route_settings (id, link_expiry_hours) 
VALUES (1, 12)
ON CONFLICT (id) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_route_licenses_user_id ON route_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_route_licenses_expires_at ON route_licenses(expires_at);
CREATE INDEX IF NOT EXISTS idx_route_licenses_active ON route_licenses(is_active);

CREATE INDEX IF NOT EXISTS idx_route_links_user_id ON route_links(user_id);
CREATE INDEX IF NOT EXISTS idx_route_links_token ON route_links(link_token);
CREATE INDEX IF NOT EXISTS idx_route_links_expires_at ON route_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_route_links_centre_route ON route_links(centre_name, route_number);

