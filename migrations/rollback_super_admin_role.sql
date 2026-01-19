-- ============================================================================
-- ROLLBACK SCRIPT: Remove Super Admin Role Support
-- ============================================================================
-- This script reverts the changes made by add_super_admin_role.sql
-- Run this in your Supabase SQL Editor to undo the 2-tier admin system
-- ============================================================================

-- ============================================================================
-- STEP 1: Downgrade all super_admin users to regular admin (OPTIONAL)
-- ============================================================================
-- Uncomment the query below if you want to convert all super_admins to regular admins
-- If you skip this, users with role='super_admin' will continue to exist but won't have special privileges

/*
UPDATE profiles 
SET role = 'admin' 
WHERE role = 'super_admin';

-- Verify the downgrade
SELECT id, email, full_name, role 
FROM profiles 
WHERE role IN ('admin', 'super_admin')
ORDER BY role DESC;
*/

-- ============================================================================
-- STEP 2: Revert column comment to original (remove super_admin documentation)
-- ============================================================================
COMMENT ON COLUMN profiles.role IS 'User role: ''user'' (default) or ''admin''';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check current role distribution
SELECT 
    role,
    COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

-- List all admin users (to verify no super_admin exists if you ran STEP 1)
SELECT 
    id,
    email,
    full_name,
    role,
    created_at
FROM profiles
WHERE role IN ('admin', 'super_admin')
ORDER BY created_at DESC;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. This rollback script is SAFE to run - it only updates metadata
-- 2. If you converted super_admin to admin (STEP 1), those users will still
--    be able to access admin panel, just without elevated privileges
-- 3. No data is deleted, only role values are changed
-- 4. You can re-run the original migration if needed in the future
-- ============================================================================

-- Rollback completed!
SELECT 'Database rollback completed successfully!' as status;
