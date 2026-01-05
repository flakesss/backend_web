-- Quick Fix: Recreate coupon_stats view with all required columns
-- Run this in Supabase SQL Editor

-- Drop existing view
DROP VIEW IF EXISTS coupon_stats;

-- Recreate with all columns
CREATE OR REPLACE VIEW coupon_stats AS
SELECT 
  c.id,
  c.code,
  c.discount_amount,
  c.discount_type,
  c.quota,
  c.max_uses_per_user,
  c.is_active,
  c.valid_from,
  c.valid_until,
  c.created_at,
  c.updated_at,
  COUNT(cu.id) as times_used,
  c.quota + COUNT(cu.id) as original_quota
FROM coupons c
LEFT JOIN coupon_uses cu ON c.id = cu.coupon_id
GROUP BY c.id, c.code, c.discount_amount, c.discount_type, c.quota, c.max_uses_per_user, 
         c.is_active, c.valid_from, c.valid_until, c.created_at, c.updated_at;

-- Verify view exists and has correct columns
SELECT * FROM coupon_stats LIMIT 1;
