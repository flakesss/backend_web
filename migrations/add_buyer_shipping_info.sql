-- ============================================================
-- ADD BUYER SHIPPING INFO COLUMNS TO ORDERS TABLE
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add buyer shipping address reference
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_address_id UUID REFERENCES shipping_addresses(id);

-- Add courier selection information
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_service VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_price INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_eta VARCHAR(50);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_buyer_address_id ON orders(buyer_address_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier_code ON orders(courier_code);

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('buyer_address_id', 'courier_code', 'courier_service', 'courier_price', 'courier_eta')
ORDER BY column_name;
