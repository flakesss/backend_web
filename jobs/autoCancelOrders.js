// Auto-cancel scheduler for expired orders
// This runs every hour to check and cancel orders that haven't been paid within 24 hours

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials for auto-cancel scheduler');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Cancel orders that have passed their payment deadline
 */
async function cancelExpiredOrders() {
    try {
        console.log('[Auto-Cancel] Checking for expired orders...');

        // Call the database function to cancel expired orders
        const { data, error } = await supabase.rpc('cancel_expired_orders');

        if (error) {
            console.error('[Auto-Cancel] Error:', error);
            return { success: false, error };
        }

        const result = data[0] || { cancelled_count: 0, order_ids: [] };

        if (result.cancelled_count > 0) {
            console.log(`[Auto-Cancel] ✅ Cancelled ${result.cancelled_count} expired orders`);
            console.log(`[Auto-Cancel] Order IDs: ${result.order_ids.join(', ')}`);

            // Optional: Send notifications to users about cancelled orders
            // await sendCancellationNotifications(result.order_ids);
        } else {
            console.log('[Auto-Cancel] No expired orders found');
        }

        return {
            success: true,
            cancelledCount: result.cancelled_count,
            orderIds: result.order_ids
        };

    } catch (err) {
        console.error('[Auto-Cancel] Unexpected error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Start the auto-cancel scheduler
 * Runs every hour
 */
function startAutoCancelScheduler() {
    console.log('[Auto-Cancel] Scheduler started - Running every hour');

    // Run immediately on start
    cancelExpiredOrders();

    // Then run every hour (3600000 ms)
    setInterval(() => {
        cancelExpiredOrders();
    }, 60 * 60 * 1000); // 1 hour
}

/**
 * Manual trigger for testing
 */
async function triggerManualCancel() {
    console.log('[Auto-Cancel] Manual trigger initiated');
    return await cancelExpiredOrders();
}

module.exports = {
    cancelExpiredOrders,
    startAutoCancelScheduler,
    triggerManualCancel
};

// If run directly (not required as module)
if (require.main === module) {
    console.log('Running auto-cancel as standalone script...');
    cancelExpiredOrders().then(result => {
        console.log('Result:', result);
        process.exit(result.success ? 0 : 1);
    });
}
