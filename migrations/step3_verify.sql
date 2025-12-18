-- ============================================================
-- STEP 3: Verify data
-- ============================================================
-- Run this to check if migration worked!

SELECT 
  id,
  title,
  product_price,
  platform_fee,
  total_amount,
  (product_price + platform_fee) as calculated_total,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;

-- This should show:
-- - product_price = original amount minus 2.5%
-- - platform_fee = 2.5% of original
-- - total_amount = product_price + platform_fee
