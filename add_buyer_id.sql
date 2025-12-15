-- ============================================================
-- ADD BUYER_ID COLUMN TO ORDERS TABLE
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add buyer_id column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES auth.users(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);

-- Verify column was added
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'buyer_id';
