// Google OAuth Handler with Account Linking
// Merges Google accounts with existing email/password accounts

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Handle OAuth user sign in
 * Links to existing account if email already exists
 */
async function handleOAuthUser(oauthUser) {
    try {
        const email = oauthUser.email;
        const userId = oauthUser.id;
        const provider = oauthUser.app_metadata?.provider || 'google';

        console.log(`[OAuth] Processing ${provider} login for: ${email}`);

        // Check if user profile exists with this email (from email/password signup)
        const { data: existingProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .single();

        if (profileError && profileError.code !== 'PGRST116') {
            console.error('[OAuth] Error checking profile:', profileError);
        }

        if (existingProfile && existingProfile.id !== userId) {
            // Email exists but different user ID (email/password account)
            console.log('[OAuth] Found existing account, merging...');

            // Update the existing profile to link with OAuth user ID
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    oauth_provider: provider,
                    oauth_user_id: userId,
                    picture: oauthUser.user_metadata?.avatar_url || existingProfile.picture,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingProfile.id);

            if (updateError) {
                console.error('[OAuth] Error updating profile:', updateError);
            } else {
                console.log('[OAuth] ✅ Account linked successfully');
            }

            // Delete the duplicate OAuth auth entry if it was created
            // (Supabase might auto-create it)
            const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
            if (deleteError) {
                console.error('[OAuth] Could not delete duplicate user:', deleteError);
            }

            return {
                success: true,
                merged: true,
                profileId: existingProfile.id
            };
        }

        // No existing profile, or same user ID - create/update profile
        const profileData = {
            id: userId,
            email: email,
            full_name: oauthUser.user_metadata?.full_name || oauthUser.user_metadata?.name || email.split('@')[0],
            phone: oauthUser.phone || null,
            picture: oauthUser.user_metadata?.avatar_url || null,
            oauth_provider: provider,
            oauth_user_id: userId,
            email_verified: true, // OAuth emails are pre-verified
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Upsert profile
        const { error: upsertError } = await supabase
            .from('profiles')
            .upsert(profileData, { onConflict: 'id' });

        if (upsertError) {
            console.error('[OAuth] Error creating/updating profile:', upsertError);
            return { success: false, error: upsertError.message };
        }

        console.log('[OAuth] ✅ Profile created/updated successfully');

        return {
            success: true,
            merged: false,
            profileId: userId
        };

    } catch (err) {
        console.error('[OAuth] Unexpected error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Check if email is already registered
 */
async function checkEmailExists(email) {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, oauth_provider')
        .eq('email', email)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('[OAuth] Error checking email:', error);
        return { exists: false };
    }

    return {
        exists: !!data,
        profile: data
    };
}

module.exports = {
    handleOAuthUser,
    checkEmailExists
};
