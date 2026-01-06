-- Order Cancellation System Migration
-- Purpose: Allow sellers to cancel orders with admin approval for paid orders
-- Date: 2026-01-06

-- 1. Add cancellation columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id);

-- 2. Create order_cancellation_requests table
CREATE TABLE IF NOT EXISTS order_cancellation_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID REFERENCES profiles(id) NOT NULL, -- Seller who requested
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_by UUID REFERENCES profiles(id), -- Admin who reviewed
  reviewed_at TIMESTAMP DEFAULT NULL,
  admin_notes TEXT,
  UNIQUE(order_id, status) -- Only one pending request per order
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_cancelled ON orders(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON order_cancellation_requests(status);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_order ON order_cancellation_requests(order_id);

-- 4. Add comments for documentation
COMMENT ON COLUMN orders.cancelled_at IS 'Timestamp when order was cancelled';
COMMENT ON COLUMN orders.cancellation_reason IS 'Reason for cancellation';
COMMENT ON COLUMN orders.cancelled_by IS 'User ID who cancelled the order';
COMMENT ON TABLE order_cancellation_requests IS 'Tracks cancellation requests that need admin approval';

-- 5. Update order status to include cancelled
-- Note: This assumes you might want to add 'cancelled' as a valid status
-- If your status column uses ENUM, you may need to alter it:
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
-- ALTER TABLE orders ADD CONSTRAINT orders_status_check 
--   CHECK (status IN ('awaiting_payment', 'payment_pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'completed'));

-- For now, we'll just use cancelled_at column to mark cancellations

-- 6. Create view for cancellation requests with order details
CREATE OR REPLACE VIEW cancellation_requests_view AS
SELECT 
  cr.id,
  cr.order_id,
  cr.reason,
  cr.status,
  cr.requested_at,
  cr.reviewed_at,
  cr.admin_notes,
  o.order_number,
  o.total_amount,
  o.status as order_status,
  seller.full_name as seller_name,
  seller.email as seller_email,
  reviewer.full_name as reviewer_name
FROM order_cancellation_requests cr
JOIN orders o ON cr.order_id = o.id
JOIN profiles seller ON cr.requested_by = seller.id
LEFT JOIN profiles reviewer ON cr.reviewed_by = reviewer.id
ORDER BY cr.requested_at DESC;

-- 7. Grant necessary permissions (adjust based on your RLS policies)
-- GRANT SELECT, INSERT ON order_cancellation_requests TO authenticated;
-- GRANT SELECT ON cancellation_requests_view TO authenticated;

-- Verification queries
SELECT 'Orders table updated' as status;
SELECT COUNT(*) as cancellation_requests_created FROM order_cancellation_requests;
SELECT * FROM cancellation_requests_view LIMIT 1;
