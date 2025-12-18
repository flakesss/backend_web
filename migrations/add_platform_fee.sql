-- Add product_price and platform_fee columns to orders table
-- This migration adds support for 2.5% platform fee tracking

-- Add new columns
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS product_price INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS platform_fee INTEGER DEFAULT 0;

-- Update existing orders to calculate fee retroactively (2.5%)
-- This assumes total_amount already exists and contains the full amount
UPDATE orders 
SET 
  platform_fee = CEIL(total_amount * 0.025),
  product_price = total_amount - CEIL(total_amount * 0.025)
WHERE product_price = 0 OR product_price IS NULL;

-- Add constraints to ensure data integrity
ALTER TABLE orders
ADD CONSTRAINT orders_amount_check 
CHECK (total_amount = product_price + platform_fee);

-- Add comments for documentation
COMMENT ON COLUMN orders.product_price IS 'Price of the product without platform fee';
COMMENT ON COLUMN orders.platform_fee IS 'Platform fee (2.5% of product price)';
COMMENT ON COLUMN orders.total_amount IS 'Total amount buyer pays (product_price + platform_fee)';

-- Create index for reporting queries
CREATE INDEX IF NOT EXISTS idx_orders_platform_fee ON orders(platform_fee);
CREATE INDEX IF NOT EXISTS idx_orders_product_price ON orders(product_price);
