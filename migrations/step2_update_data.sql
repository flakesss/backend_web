-- ============================================================
-- STEP 2: Update existing data
-- ============================================================
-- Run this after Step 1!

-- Calculate fee (2.5%) for all existing orders
UPDATE orders 
SET 
  platform_fee = CEIL(total_amount * 0.025),
  product_price = total_amount - CEIL(total_amount * 0.025)
WHERE total_amount > 0;
