-- Create QRIS Settings Table
-- Stores admin's uploaded QRIS configuration

CREATE TABLE IF NOT EXISTS qris_settings (
  id SERIAL PRIMARY KEY,
  qris_data TEXT NOT NULL,                    -- Full QRIS string from uploaded QR
  qris_image_url TEXT,                        -- URL to uploaded QRIS image (optional)
  merchant_name VARCHAR(255) DEFAULT 'Flocify',
  merchant_city VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create QRIS Transactions Table (for audit/tracking)
CREATE TABLE IF NOT EXISTS qris_transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  order_id INTEGER,                           -- Link to order if applicable
  amount INTEGER NOT NULL,                    -- Payment amount in IDR
  generated_qris TEXT NOT NULL,               -- The dynamic QRIS string generated
  status VARCHAR(50) DEFAULT 'pending',       -- pending, paid, expired
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,                       -- Optional expiry time
  paid_at TIMESTAMP
);

-- Add comments for documentation
COMMENT ON TABLE qris_settings IS 'Stores merchant QRIS configuration uploaded by admin';
COMMENT ON TABLE qris_transactions IS 'Tracks all generated dynamic QRIS for payments';

COMMENT ON COLUMN qris_settings.qris_data IS 'Base QRIS string extracted from uploaded QR image';
COMMENT ON COLUMN qris_settings.is_active IS 'Only one QRIS should be active at a time';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_qris_settings_active ON qris_settings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_qris_transactions_user ON qris_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_qris_transactions_status ON qris_transactions(status);

-- Only allow one active QRIS at a time (optional constraint)
-- CREATE UNIQUE INDEX idx_one_active_qris ON qris_settings(is_active) WHERE is_active = true;
