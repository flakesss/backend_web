// Push Notification Utility
// Send push notifications to users via Firebase Cloud Messaging

const admin = require('../config/firebase-admin');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

/**
 * Send push notification to a single user
 * @param {string} userId - User ID to send notification to
 * @param {object} notification - Notification content { title, body, image }
 * @param {object} data - Additional data payload { type, url, ... }
 * @returns {Promise<object>} Send result
 */
async function sendNotification(userId, notification, data = {}) {
    try {
        // Get user's FCM tokens
        const { data: tokens, error } = await supabaseAdmin
            .from('fcm_tokens')
            .select('token')
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error) {
            console.error('[sendNotification] Error fetching tokens:', error);
            return { success: false, error };
        }

        if (!tokens || tokens.length === 0) {
            console.log('[sendNotification] No FCM tokens found for user:', userId);
            return { success: false, message: 'No tokens found' };
        }

        const fcmTokens = tokens.map(t => t.token);

        // Prepare FCM message
        const message = {
            notification: {
                title: notification.title,
                body: notification.body,
                ...(notification.image && { image: notification.image })
            },
            data: {
                ...data,
                click_action: data.url || '/',
                type: data.type || 'default'
            },
            tokens: fcmTokens,
            webpush: {
                fcmOptions: {
                    link: data.url || '/'
                }
            }
        };

        // Send to all user's devices
        const response = await admin.messaging().sendMulticast(message);

        console.log(`[sendNotification] Sent ${response.successCount}/${fcmTokens.length} notifications to user ${userId}`);

        // Remove invalid tokens
        if (response.failureCount > 0) {
            const tokensToRemove = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    // Remove token if it's invalid or unregistered
                    if (errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered') {
                        tokensToRemove.push(fcmTokens[idx]);
                        console.log(`[sendNotification] Marking token as inactive:`, errorCode);
                    }
                }
            });

            if (tokensToRemove.length > 0) {
                await supabaseAdmin
                    .from('fcm_tokens')
                    .update({ is_active: false })
                    .in('token', tokensToRemove);
                console.log(`[sendNotification] Deactivated ${tokensToRemove.length} invalid tokens`);
            }
        }

        // Log to notification history
        await supabaseAdmin
            .from('notification_history')
            .insert({
                user_id: userId,
                title: notification.title,
                body: notification.body,
                type: data.type || 'default',
                data: data,
                delivered: response.successCount > 0
            });

        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount
        };
    } catch (error) {
        console.error('[sendNotification] Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send notification to multiple users
 * @param {string[]} userIds - Array of user IDs
 * @param {object} notification - Notification content
 * @param {object} data - Additional data payload
 * @returns {Promise<object>} Send results
 */
async function sendNotificationToUsers(userIds, notification, data = {}) {
    const promises = userIds.map(userId =>
        sendNotification(userId, notification, data)
    );

    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    return {
        success: true,
        total: userIds.length,
        successCount,
        failureCount: userIds.length - successCount
    };
}

/**
 * Broadcast notification to all users
 * @param {object} notification - Notification content
 * @param {object} data - Additional data payload
 * @returns {Promise<object>} Broadcast result
 */
async function broadcastNotification(notification, data = {}) {
    try {
        // Get all active FCM tokens
        const { data: tokens, error } = await supabaseAdmin
            .from('fcm_tokens')
            .select('token, user_id')
            .eq('is_active', true);

        if (error) {
            console.error('[broadcastNotification] Error fetching tokens:', error);
            return { success: false, error };
        }

        if (!tokens || tokens.length === 0) {
            console.log('[broadcastNotification] No active tokens found');
            return { success: false, message: 'No active tokens' };
        }

        const fcmTokens = tokens.map(t => t.token);
        console.log(`[broadcastNotification] Broadcasting to ${fcmTokens.length} devices`);

        // FCM limit: 500 tokens per batch
        const batches = [];
        for (let i = 0; i < fcmTokens.length; i += 500) {
            batches.push(fcmTokens.slice(i, i + 500));
        }

        // Send to all batches
        const responses = await Promise.all(
            batches.map(batch =>
                admin.messaging().sendMulticast({
                    notification: {
                        title: notification.title,
                        body: notification.body,
                        ...(notification.image && { image: notification.image })
                    },
                    data: {
                        ...data,
                        click_action: data.url || '/',
                        type: data.type || 'broadcast'
                    },
                    tokens: batch,
                    webpush: {
                        fcmOptions: {
                            link: data.url || '/'
                        }
                    }
                })
            )
        );

        const totalSuccess = responses.reduce((sum, r) => sum + r.successCount, 0);
        const totalFailed = responses.reduce((sum, r) => sum + r.failureCount, 0);

        console.log(`[broadcastNotification] Broadcast complete: ${totalSuccess} sent, ${totalFailed} failed`);

        // Log broadcast to history (one entry per unique user)
        const uniqueUserIds = [...new Set(tokens.map(t => t.user_id))];
        const historyEntries = uniqueUserIds.map(userId => ({
            user_id: userId,
            title: notification.title,
            body: notification.body,
            type: data.type || 'broadcast',
            data: data,
            delivered: true
        }));

        await supabaseAdmin
            .from('notification_history')
            .insert(historyEntries);

        return {
            success: true,
            totalDevices: fcmTokens.length,
            successCount: totalSuccess,
            failureCount: totalFailed
        };
    } catch (error) {
        console.error('[broadcastNotification] Error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendNotification,
    sendNotificationToUsers,
    broadcastNotification
};
