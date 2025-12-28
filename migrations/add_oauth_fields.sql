-- Add OAuth provider fields to profiles table
-- This allows tracking which OAuth provider a user signed in with

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS oauth_user_id TEXT,
ADD COLUMN IF NOT EXISTS picture TEXT;

-- Create index for faster OAuth lookups
CREATE INDEX IF NOT EXISTS idx_profiles_oauth_user_id ON profiles(oauth_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Update existing profiles to mark auth method correctly
-- Phone-based registration: has phone, email is NULL or invalid
UPDATE profiles 
SET oauth_provider = 'phone'
WHERE oauth_provider IS NULL 
  AND phone IS NOT NULL
  AND (email IS NULL OR email NOT LIKE '%@%');

-- Email-based registration: has valid email
UPDATE profiles 
SET oauth_provider = 'email'
WHERE oauth_provider IS NULL 
  AND email IS NOT NULL 
  AND email LIKE '%@%';

-- Fallback: if still NULL, set to 'email' (default)
UPDATE profiles 
SET oauth_provider = 'email'
WHERE oauth_provider IS NULL;

COMMENT ON COLUMN profiles.oauth_provider IS 'Auth method: google, facebook, email, phone';
COMMENT ON COLUMN profiles.oauth_user_id IS 'User ID from OAuth provider';
COMMENT ON COLUMN profiles.picture IS 'Profile picture URL from OAuth or uploaded';
