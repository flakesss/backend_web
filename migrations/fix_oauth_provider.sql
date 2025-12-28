-- Fix OAuth Provider for Existing Accounts
-- Run this if you already ran the old migration and need to fix the data

-- Reset all oauth_provider to NULL first (optional, for clean slate)
-- UPDATE profiles SET oauth_provider = NULL;

-- Step 1: Fix phone-based registrations
-- These are accounts that registered with phone number only (no email)
UPDATE profiles 
SET oauth_provider = 'phone'
WHERE oauth_provider = 'email'  -- Currently wrong
  AND phone IS NOT NULL
  AND (email IS NULL OR email NOT LIKE '%@%' OR email = '');

-- Step 2: Keep email-based registrations as 'email'
-- These accounts have valid email addresses
-- (No action needed if already set to 'email')

-- Step 3: Verify the fix
SELECT 
  oauth_provider,
  COUNT(*) as count,
  COUNT(CASE WHEN email IS NOT NULL AND email LIKE '%@%' THEN 1 END) as has_valid_email,
  COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as has_phone
FROM profiles
GROUP BY oauth_provider
ORDER BY oauth_provider;

-- Expected results:
-- oauth_provider | count | has_valid_email | has_phone
-- ---------------|-------|-----------------|----------
-- email          |  XX   |      XX         |    XX
-- phone          |  XX   |       0         |    XX
-- google         |  XX   |      XX         |    XX (optional)

COMMENT ON TABLE profiles IS 'User profiles with auth method tracking';
