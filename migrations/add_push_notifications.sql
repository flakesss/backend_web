-- Migration: Add FCM Tokens for Push Notifications
-- Description: Store Firebase Cloud Messaging tokens for each user device
-- Date: 2026-01-11

-- Create FCM tokens table
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  device_type VARCHAR(50) DEFAULT 'web', -- 'web', 'android', 'ios'
  device_name VARCHAR(255), -- Optional: "Chrome on Windows", "iPhone 13"
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON fcm_tokens(token);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_active ON fcm_tokens(is_active) WHERE is_active = true;

-- Create notification history table (optional, for tracking)
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50), -- 'payment_approved', 'new_promo', 'order_status', etc.
  data JSONB, -- Additional payload data
  sent_at TIMESTAMP DEFAULT NOW(),
  delivered BOOLEAN DEFAULT false,
  clicked BOOLEAN DEFAULT false,
  clicked_at TIMESTAMP
);

-- Index for notification history
CREATE INDEX IF NOT EXISTS idx_notification_history_user ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(type);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at DESC);

-- View for active tokens per user
CREATE OR REPLACE VIEW user_notification_stats AS
SELECT 
  p.id as user_id,
  p.full_name,
  p.email,
  COUNT(DISTINCT ft.id) as active_devices,
  MAX(ft.last_used_at) as last_notification_at,
  COUNT(DISTINCT nh.id) as total_notifications_sent,
  COUNT(DISTINCT CASE WHEN nh.clicked = true THEN nh.id END) as notifications_clicked
FROM profiles p
LEFT JOIN fcm_tokens ft ON p.id = ft.user_id AND ft.is_active = true
LEFT JOIN notification_history nh ON p.id = nh.user_id
GROUP BY p.id, p.full_name, p.email;

-- Function to clean expired/invalid tokens
CREATE OR REPLACE FUNCTION clean_inactive_tokens(days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM fcm_tokens
  WHERE last_used_at < NOW() - (days || ' days')::INTERVAL
  AND is_active = true;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE fcm_tokens IS 'Stores Firebase Cloud Messaging tokens for push notifications';
COMMENT ON COLUMN fcm_tokens.token IS 'FCM device token from Firebase SDK';
COMMENT ON COLUMN fcm_tokens.device_type IS 'Type of device: web, android, or ios';
COMMENT ON COLUMN fcm_tokens.last_used_at IS 'Last time this token successfully received a notification';
COMMENT ON COLUMN fcm_tokens.is_active IS 'Whether this token is still valid (auto-updated on send failures)';

COMMENT ON TABLE notification_history IS 'Log of all sent push notifications for analytics';
COMMENT ON COLUMN notification_history.delivered IS 'Whether notification was successfully delivered to FCM';
COMMENT ON COLUMN notification_history.clicked IS 'Whether user clicked on the notification';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON fcm_tokens TO authenticated;
-- GRANT SELECT ON notification_history TO authenticated;
