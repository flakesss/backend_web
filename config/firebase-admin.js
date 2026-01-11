// Firebase Admin SDK Initialization for Push Notifications
const admin = require('firebase-admin');
const path = require('path');

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
    console.log('📁 Using Firebase credentials from service account file');

    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
    const serviceAccount = require(serviceAccountPath);
    credential = admin.credential.cert(serviceAccount);
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
