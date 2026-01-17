// Admin Role Middleware
// Checks if authenticated user has admin role

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Middleware to check if user is admin
 * Must be used after requireAuth middleware
 */
async function requireAdmin(req, res, next) {
    try {
        // User should already be set by requireAuth middleware
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please login first'
            });
        }

        const userId = req.user.id;

        // Get user profile with role
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('[Admin Check] Database error:', error);
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to verify admin status'
            });
        }

        if (!profile) {
            return res.status(404).json({
                error: 'User not found',
                message: 'User profile not found'
            });
        }

        // Check if user is admin
        if (profile.role !== 'admin') {
            console.warn(`[Admin Check] Unauthorized access attempt by user: ${userId}`);
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Admin access required. You do not have permission to access this resource.'
            });
        }

        // User is admin, allow access
        console.log(`[Admin Check] ✅ Admin access granted to user: ${userId}`);
        req.userRole = profile.role;
        next();

    } catch (err) {
        console.error('[Admin Check] Unexpected error:', err);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to verify admin status'
        });
    }
}

/**
 * Helper function to check if a user is an admin
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} - True if user is admin, false otherwise
 */
async function isUserAdmin(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            return false;
        }

        return profile.role === 'admin';
    } catch (err) {
        console.error('[Admin Check] Error checking admin status:', err);
        return false;
    }
}

module.exports = {
    requireAdmin,
    isUserAdmin
};
