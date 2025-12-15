-- ============================================================
-- ADD BANK_ACCOUNT_ID COLUMN TO ORDERS TABLE
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add bank_account_id column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_bank_account_id ON orders(bank_account_id);

-- Verify column was added
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name IN ('buyer_id', 'bank_account_id');
