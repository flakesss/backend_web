-- ============================================================
-- CREATE BANK_ACCOUNTS TABLE
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop existing table if it has wrong structure (optional - be careful!)
-- DROP TABLE IF EXISTS bank_accounts CASCADE;

-- Create bank_accounts table
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id);

-- Disable RLS for easier development (you can enable and add policies later)
ALTER TABLE bank_accounts DISABLE ROW LEVEL SECURITY;

-- Verify table structure
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'bank_accounts' ORDER BY ordinal_position;
