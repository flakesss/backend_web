-- ============================================================
-- ADD METADATA COLUMN TO PAYMENTS TABLE
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add metadata column to store shipping information
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add index for metadata queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_payments_metadata ON payments USING GIN (metadata);

-- Verify column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payments' 
AND column_name = 'metadata';

-- Example metadata structure:
-- {
--   "selectedAddressId": "uuid-here",
--   "selectedCourier": {
--     "courier_code": "jne",
--     "name": "JNE",
--     "service": "REG",
--     "price": 23000,
--     "eta": "2-3 hari"
--   }
-- }
