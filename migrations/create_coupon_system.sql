-- Coupon System Database Schema
-- Purpose: Allow users to use coupon codes to waive admin fees

-- 1. Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- e.g., "GRATISREKBER", "PROMO2024"
  discount_amount INTEGER DEFAULT 0,      -- e.g., 5000 (amount in Rupiah)
  discount_type VARCHAR(20) DEFAULT 'fixed', -- 'fixed' or 'percentage'
  quota INTEGER DEFAULT 0,                -- Remaining usage quota
  max_uses_per_user INTEGER DEFAULT 1,   -- Max uses per user (null = unlimited)
  is_active BOOLEAN DEFAULT true,
  valid_from TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP DEFAULT NULL,    -- NULL = no expiry
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create coupon usage tracking table
CREATE TABLE IF NOT EXISTS coupon_uses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  discount_applied INTEGER NOT NULL,
  used_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(coupon_id, user_id, order_id)
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupon_uses_user ON coupon_uses(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_uses_coupon ON coupon_uses(coupon_id);

-- 4. Create function to validate and check coupon
CREATE OR REPLACE FUNCTION check_coupon_validity(
  coupon_code TEXT,
  user_id_input UUID
)
RETURNS TABLE (
  is_valid BOOLEAN,
  discount_amount INTEGER,
  discount_type VARCHAR(20),
  message TEXT
) AS $$
DECLARE
  coupon_record RECORD;
  usage_count INTEGER;
BEGIN
  -- Get coupon details
  SELECT * INTO coupon_record
  FROM coupons
  WHERE code = coupon_code
    AND is_active = true;
  
  -- Check if coupon exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'fixed'::VARCHAR(20), 'Kode kupon tidak valid';
    RETURN;
  END IF;
  
  -- Check if expired
  IF coupon_record.valid_until IS NOT NULL AND coupon_record.valid_until < NOW() THEN
    RETURN QUERY SELECT false, 0, 'fixed'::VARCHAR(20), 'Kupon sudah expired';
    RETURN;
  END IF;
  
  -- Check if not yet valid
  IF coupon_record.valid_from > NOW() THEN
    RETURN QUERY SELECT false, 0, 'fixed'::VARCHAR(20), 'Kupon belum dapat digunakan';
    RETURN;
  END IF;
  
  -- Check quota
  IF coupon_record.quota <= 0 THEN
    RETURN QUERY SELECT false, 0, 'fixed'::VARCHAR(20), 'Kuota kupon sudah habis';
    RETURN;
  END IF;
  
  -- Check per-user usage limit
  IF coupon_record.max_uses_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO usage_count
    FROM coupon_uses
    WHERE coupon_id = coupon_record.id
      AND user_id = user_id_input;
    
    IF usage_count >= coupon_record.max_uses_per_user THEN
      RETURN QUERY SELECT false, 0, 'fixed'::VARCHAR(20), 'Anda sudah mencapai batas penggunaan kupon ini';
      RETURN;
    END IF;
  END IF;
  
  -- Coupon is valid
  RETURN QUERY SELECT 
    true, 
    coupon_record.discount_amount, 
    coupon_record.discount_type::VARCHAR(20),
    'Kupon berhasil diterapkan!'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 5. Create function to use/redeem coupon
CREATE OR REPLACE FUNCTION use_coupon(
  coupon_code TEXT,
  user_id_input UUID,
  order_id_input UUID,
  discount_applied_input INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  coupon_id_var UUID;
BEGIN
  -- Get coupon ID and decrease quota
  UPDATE coupons
  SET quota = quota - 1,
      updated_at = NOW()
  WHERE code = coupon_code
    AND is_active = true
    AND quota > 0
  RETURNING id INTO coupon_id_var;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Record usage
  INSERT INTO coupon_uses (coupon_id, user_id, order_id, discount_applied)
  VALUES (coupon_id_var, user_id_input, order_id_input, discount_applied_input);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- 6. Insert initial coupons (examples)
INSERT INTO coupons (code, discount_amount, discount_type, quota, max_uses_per_user, valid_until)
VALUES 
  ('GRATISREKBER', 5000, 'fixed', 100, 1, NOW() + INTERVAL '30 days'),
  ('PROMO2024', 3000, 'fixed', 50, 1, NOW() + INTERVAL '7 days')
ON CONFLICT (code) DO NOTHING;

-- 7. Add comments for documentation
COMMENT ON TABLE coupons IS 'Coupon codes for discounts on admin fees';
COMMENT ON TABLE coupon_uses IS 'Track coupon usage history';
COMMENT ON FUNCTION check_coupon_validity IS 'Validate coupon code for a user';
COMMENT ON FUNCTION use_coupon IS 'Redeem/use a coupon and decrease quota';

-- 8. View to check coupon stats
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
GROUP BY c.id, c.code, c.discount_amount, c.discount_type, c.quota, c.max_uses_per_user, c.is_active, c.valid_from, c.valid_until, c.created_at, c.updated_at;

-- Verification query
SELECT * FROM coupon_stats;
