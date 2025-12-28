-- Fix Auto-Cancel Function for UUID-based Order IDs
-- Run this in Supabase SQL Editor

-- Drop old function if exists (might have wrong data types)
DROP FUNCTION IF EXISTS cancel_expired_orders();

-- Create function with correct UUID data type
CREATE OR REPLACE FUNCTION cancel_expired_orders()
RETURNS TABLE (
    cancelled_count INTEGER,
    order_ids TEXT[]  -- Changed from INTEGER[] to TEXT[] for UUIDs
) AS $$
DECLARE
    expired_orders TEXT[];
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
          AND payment_deadline IS NOT NULL
        RETURNING id::TEXT  -- Cast UUID to TEXT
    )
    SELECT array_agg(id), COUNT(*)
    INTO expired_orders, count
    FROM updated;

    RETURN QUERY SELECT 
        COALESCE(count, 0)::INTEGER as cancelled_count,
        COALESCE(expired_orders, ARRAY[]::TEXT[]) as order_ids;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT * FROM cancel_expired_orders();

-- Should return:
-- cancelled_count | order_ids
-- 0              | {}

COMMENT ON FUNCTION cancel_expired_orders() IS 'Auto-cancel orders that exceeded payment deadline (24 hours)';
