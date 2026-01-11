// Firebase Admin SDK Initialization for Push Notifications
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
let credential;

// Option 1: Use environment variables (Production/Render)
if (process.env.FIREBASE_PRIVATE_KEY) {
    console.log('🔐 Using Firebase credentials from environment variables');

    credential = admin.credential.cert({
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Fix escaped newlines
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    });
}
// Option 2: Use service account file (Local development)
else {
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');

    // Check if file exists before requiring
    if (fs.existsSync(serviceAccountPath)) {
        console.log('📁 Using Firebase credentials from service account file');
        const serviceAccount = require(serviceAccountPath);
        credential = admin.credential.cert(serviceAccount);
    } else {
        // File doesn't exist and no env vars - throw helpful error
        throw new Error(
            '❌ Firebase credentials not configured!\n\n' +
            'Option 1 (Recommended for production):\n' +
            '  Set environment variables:\n' +
            '  - FIREBASE_PROJECT_ID\n' +
            '  - FIREBASE_PRIVATE_KEY_ID\n' +
            '  - FIREBASE_PRIVATE_KEY\n' +
            '  - FIREBASE_CLIENT_EMAIL\n' +
            '  - FIREBASE_CLIENT_ID\n' +
            '  - FIREBASE_CLIENT_CERT_URL\n\n' +
            'Option 2 (Local development):\n' +
            '  Create file: config/firebase-service-account.json\n\n' +
            'See RENDER_FIREBASE_ENV_SETUP.md for detailed instructions.'
        );
    }
}

// Check if already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: credential
    });
    console.log('✅ Firebase Admin initialized successfully');
} else {
    console.log('ℹ️ Firebase Admin already initialized');
}

module.exports = admin;
