-- Add seller postal code and address reference to orders table
-- This is needed for shipping rate calculation on buyer side

ALTER TABLE orders
ADD COLUMN seller_postal_code TEXT,
ADD COLUMN seller_address_id UUID REFERENCES shipping_addresses(id);

COMMENT ON COLUMN orders.seller_postal_code IS 'Seller origin postal code for shipping rate calculation';
COMMENT ON COLUMN orders.seller_address_id IS 'Reference to seller shipping address used for this order';

-- Verify columns added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN ('seller_postal_code', 'seller_address_id');
