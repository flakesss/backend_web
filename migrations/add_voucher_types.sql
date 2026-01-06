-- Migration: Add Public/Private Voucher Types
-- Purpose: Allow both public vouchers (anyone can use) and private vouchers (specific users only)
-- Date: 2026-01-06

-- 1. Add voucher_type column to coupons table
ALTER TABLE coupons 
ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(20) DEFAULT 'public' CHECK (voucher_type IN ('public', 'private'));

-- 2. Add description column for admin notes
ALTER TABLE coupons
ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Create user_vouchers table for private voucher assignments
CREATE TABLE IF NOT EXISTS user_vouchers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id), -- Admin who assigned it
  is_claimed BOOLEAN DEFAULT false,
  claimed_at TIMESTAMP DEFAULT NULL,
  UNIQUE(coupon_id, user_id)
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coupons_type ON coupons(voucher_type);
CREATE INDEX IF NOT EXISTS idx_user_vouchers_user ON user_vouchers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vouchers_coupon ON user_vouchers(coupon_id);

-- 5. Update coupon_stats view to include voucher_type
DROP VIEW IF EXISTS coupon_stats;
CREATE OR REPLACE VIEW coupon_stats AS
SELECT 
  c.id,
  c.code,
  c.description,
  c.discount_amount,
  c.discount_type,
  c.quota,
  c.max_uses_per_user,
  c.voucher_type,
  c.is_active,
  c.valid_from,
  c.valid_until,
  c.created_at,
  c.updated_at,
  COUNT(cu.id) as times_used,
  c.quota + COUNT(cu.id) as original_quota,
  -- Count how many users have been assigned this voucher (for private vouchers)
  (SELECT COUNT(*) FROM user_vouchers uv WHERE uv.coupon_id = c.id) as assigned_users_count
FROM coupons c
LEFT JOIN coupon_uses cu ON c.id = cu.coupon_id
GROUP BY c.id, c.code, c.description, c.discount_amount, c.discount_type, c.quota, 
         c.max_uses_per_user, c.voucher_type, c.is_active, c.valid_from, c.valid_until, 
         c.created_at, c.updated_at;

-- 6. Add comment for documentation
COMMENT ON COLUMN coupons.voucher_type IS 'Type of voucher: public (anyone can use) or private (assigned to specific users)';
COMMENT ON TABLE user_vouchers IS 'Tracks which users have been assigned private vouchers';

-- 7. Insert sample private voucher for new users
INSERT INTO coupons (code, description, discount_amount, discount_type, quota, max_uses_per_user, voucher_type, valid_until)
VALUES 
  ('WELCOME2024', 'Welcome voucher for new users', 5000, 'fixed', 1000, 1, 'private', NOW() + INTERVAL '365 days')
ON CONFLICT (code) DO NOTHING;

-- Verification
SELECT 
  code, 
  voucher_type, 
  description,
  discount_amount,
  quota,
  (SELECT COUNT(*) FROM user_vouchers WHERE coupon_id = coupons.id) as assigned_to
FROM coupons
ORDER BY created_at DESC
LIMIT 5;
