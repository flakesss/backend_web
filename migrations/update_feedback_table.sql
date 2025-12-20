-- Update feedback table to add user_full_name and improve feedback_type

-- Add user_full_name column
ALTER TABLE public.feedback 
ADD COLUMN IF NOT EXISTS user_full_name VARCHAR(255);

-- Add index for user_full_name
CREATE INDEX IF NOT EXISTS idx_feedback_user_full_name ON public.feedback(user_full_name);

-- Update feedback_type to use specific values
-- Change default and add constraint
ALTER TABLE public.feedback 
ALTER COLUMN feedback_type SET DEFAULT 'buyer_payment_completed';

-- Add comment to explain feedback types
COMMENT ON COLUMN public.feedback.feedback_type IS 'Type of feedback: seller_order_created (after seller creates order) or buyer_payment_completed (after buyer pays)';

-- Add check constraint for feedback_type values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'feedback_type_check'
  ) THEN
    ALTER TABLE public.feedback
    ADD CONSTRAINT feedback_type_check 
    CHECK (feedback_type IN (
      'seller_order_created', 
      'buyer_payment_completed',
      'post_transaction',  -- Legacy support
      'general'            -- Legacy support
    ));
  END IF;
END $$;

-- Create index for feedback_type
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback(feedback_type);

-- Update existing records to use new feedback_type values
-- Move old 'post_transaction' to 'buyer_payment_completed'
UPDATE public.feedback 
SET feedback_type = 'buyer_payment_completed'
WHERE feedback_type = 'post_transaction';

-- Add comments
COMMENT ON COLUMN public.feedback.user_full_name IS 'Full name of the user who submitted feedback (cached for reporting)';

-- Create view for feedback analytics
CREATE OR REPLACE VIEW feedback_analytics AS
SELECT 
  f.id,
  f.order_id,
  f.order_number,
  f.user_id,
  f.user_full_name,
  f.rating,
  f.comment,
  f.feedback_type,
  CASE 
    WHEN f.feedback_type = 'seller_order_created' THEN 'Seller'
    WHEN f.feedback_type = 'buyer_payment_completed' THEN 'Buyer'
    ELSE 'Other'
  END as user_role,
  f.device_info,
  f.created_at,
  -- Join with profiles for additional info
  p.email,
  p.phone,
  -- Join with orders for order details
  o.title as order_title,
  o.total_amount as order_total,
  o.status as order_status
FROM feedback f
LEFT JOIN profiles p ON f.user_id = p.id
LEFT JOIN orders o ON f.order_id = o.id;

COMMENT ON VIEW feedback_analytics IS 'Analytics view for feedback with user and order details';
