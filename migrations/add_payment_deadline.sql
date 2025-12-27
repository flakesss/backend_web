-- Add payment deadline field to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_deadline TIMESTAMP;

-- Update existing orders to have deadline (24 hours from creation)
UPDATE orders 
SET payment_deadline = created_at + INTERVAL '24 hours'
WHERE payment_deadline IS NULL 
  AND status = 'awaiting_payment';

-- Create index for efficient querying of expired orders
CREATE INDEX IF NOT EXISTS idx_orders_payment_deadline 
ON orders(payment_deadline) 
WHERE status = 'awaiting_payment';

-- Create function to auto-cancel expired orders
CREATE OR REPLACE FUNCTION cancel_expired_orders()
RETURNS TABLE (
    cancelled_count INTEGER,
    order_ids INTEGER[]
) AS $$
DECLARE
    expired_orders INTEGER[];
    count INTEGER;
BEGIN
    -- Find and update expired orders
    WITH updated AS (
        UPDATE orders
        SET 
            status = 'cancelled',
            updated_at = NOW(),
            cancellation_reason = 'Pembayaran tidak diterima dalam 24 jam'
        WHERE status = 'awaiting_payment'
          AND payment_deadline < NOW()
        RETURNING id
    )
    SELECT array_agg(id), COUNT(*)
    INTO expired_orders, count
    FROM updated;

    RETURN QUERY SELECT 
        COALESCE(count, 0)::INTEGER as cancelled_count,
        COALESCE(expired_orders, ARRAY[]::INTEGER[]) as order_ids;
END;
$$ LANGUAGE plpgsql;

-- Add cancellation_reason field if not exists
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN orders.payment_deadline IS 'Batas waktu pembayaran (24 jam dari pembuatan order)';
COMMENT ON COLUMN orders.cancellation_reason IS 'Alasan pembatalan order';
COMMENT ON FUNCTION cancel_expired_orders() IS 'Function untuk auto-cancel orders yang expired';
