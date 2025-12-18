-- ============================================================
-- STEP 1: Add product_price and platform_fee columns
-- ============================================================
-- Run this first!

ALTER TABLE orders 
ADD COLUMN product_price INTEGER DEFAULT 0;

ALTER TABLE orders 
ADD COLUMN platform_fee INTEGER DEFAULT 0;
