-- ============================================================================
-- SHIPPING ADDRESSES FEATURE - PHASE 1: DATABASE SCHEMA
-- ============================================================================
-- Description: Create shipping address management system with Biteship integration
-- Author: Flocify Team
-- Date: 2026-01-20
-- ============================================================================

-- ============================================================================
-- 1. CREATE SHIPPING_ADDRESSES TABLE
-- ============================================================================

CREATE TABLE shipping_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User relationship
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username TEXT, -- Denormalized for quick display
  
  -- Recipient details
  recipient_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  
  -- Address details
  full_address TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT DEFAULT 'Indonesia',
  
  -- Optional metadata
  address_label TEXT, -- 'Home', 'Office', 'Other'
  notes TEXT, -- Additional delivery instructions
  
  -- Geolocation (for better rate calculation)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Address validation
  is_default BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE shipping_addresses IS 'User shipping addresses for order deliveries';
COMMENT ON COLUMN shipping_addresses.username IS 'Denormalized username for quick display';
COMMENT ON COLUMN shipping_addresses.latitude IS 'Latitude for accurate shipping rate calculation';
COMMENT ON COLUMN shipping_addresses.longitude IS 'Longitude for accurate shipping rate calculation';
COMMENT ON COLUMN shipping_addresses.is_default IS 'One default address per user';
COMMENT ON COLUMN shipping_addresses.is_verified IS 'Address validated via Biteship or manual check';

-- ============================================================================
-- 2. UPDATE ORDERS TABLE
-- ============================================================================

ALTER TABLE orders
ADD COLUMN shipping_snapshot JSONB;

COMMENT ON COLUMN orders.shipping_snapshot IS 'Immutable snapshot of shipping data at transaction time including buyer address, seller address, courier details, and tracking info';

-- ============================================================================
-- 4. CREATE INDEXES
-- ============================================================================

-- Query addresses by user
CREATE INDEX idx_shipping_addresses_user_id 
  ON shipping_addresses(user_id);

-- Find default address quickly
CREATE INDEX idx_shipping_addresses_default 
  ON shipping_addresses(user_id, is_default)
  WHERE is_default = TRUE;

-- Search by city (for analytics)
CREATE INDEX idx_shipping_addresses_city 
  ON shipping_addresses(city);

-- Search by province
CREATE INDEX idx_shipping_addresses_province 
  ON shipping_addresses(province);

-- Query orders with shipping data
CREATE INDEX idx_orders_shipping_snapshot 
  ON orders USING GIN(shipping_snapshot)
  WHERE shipping_snapshot IS NOT NULL;

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;

-- Users can view own addresses
CREATE POLICY "Users view own addresses"
  ON shipping_addresses FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert own addresses
CREATE POLICY "Users insert own addresses"
  ON shipping_addresses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own addresses
CREATE POLICY "Users update own addresses"
  ON shipping_addresses FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete own addresses
CREATE POLICY "Users delete own addresses"
  ON shipping_addresses FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can view all addresses
CREATE POLICY "Admins view all addresses"
  ON shipping_addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Auto-update timestamp on update
CREATE OR REPLACE FUNCTION update_shipping_addresses_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_shipping_addresses_timestamp
  BEFORE UPDATE ON shipping_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_shipping_addresses_timestamp();

-- Ensure only one default address per user
CREATE OR REPLACE FUNCTION ensure_one_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    -- Unset other default addresses for this user
    UPDATE shipping_addresses
    SET is_default = FALSE
    WHERE user_id = NEW.user_id
    AND id != NEW.id
    AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_default_address
  BEFORE INSERT OR UPDATE ON shipping_addresses
  FOR EACH ROW
  WHEN (NEW.is_default = TRUE)
  EXECUTE FUNCTION ensure_one_default_address();

-- ============================================================================
-- 7. VERIFICATION QUERIES
-- ============================================================================

-- Check table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'shipping_addresses'
ORDER BY ordinal_position;

-- Check indexes
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename = 'shipping_addresses';

-- Check RLS policies
SELECT 
  policyname, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE tablename = 'shipping_addresses';

-- Check triggers
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'shipping_addresses';

-- ============================================================================
-- 8. SAMPLE DATA (FOR TESTING)
-- ============================================================================

-- Sample shipping address
-- INSERT INTO shipping_addresses (
--   user_id, username, recipient_name, phone_number,
--   full_address, city, province, postal_code,
--   address_label, latitude, longitude, is_default
-- ) VALUES (
--   'USER_UUID_HERE', 
--   'john_doe',
--   'John Doe', 
--   '081234567890',
--   'Jl. Sudirman No. 123, RT 001/RW 002',
--   'Jakarta Selatan',
--   'DKI Jakarta',
--   '12190',
--   'Home',
--   -6.2088,
--   106.8456,
--   TRUE
-- );

-- Sample seller address in profile
-- UPDATE profiles
-- SET seller_address = '{
--   "sender_name": "Aquatic Shop",
--   "phone_number": "082345678901",
--   "full_address": "Jl. Gatot Subroto No. 45",
--   "city": "Bandung",
--   "province": "Jawa Barat",
--   "postal_code": "40123",
--   "coordinates": {
--     "lat": -6.9175,
--     "lng": 107.6191
--   }
-- }'::jsonb
-- WHERE id = 'SELLER_UUID_HERE';

-- ============================================================================
-- ROLLBACK SCRIPT (RUN THIS TO UNDO ALL CHANGES)
-- ============================================================================

-- DROP TRIGGER IF EXISTS set_default_address ON shipping_addresses;
-- DROP TRIGGER IF EXISTS set_shipping_addresses_timestamp ON shipping_addresses;
-- DROP FUNCTION IF EXISTS ensure_one_default_address();
-- DROP FUNCTION IF EXISTS update_shipping_addresses_timestamp();
-- ALTER TABLE orders DROP COLUMN IF EXISTS shipping_snapshot;
-- DROP TABLE IF EXISTS shipping_addresses;
