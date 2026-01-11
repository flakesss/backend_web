// Firebase Admin SDK Initialization for Push Notifications
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

// Check if already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
    });
    console.log('✅ Firebase Admin initialized successfully');
} else {
    console.log('ℹ️ Firebase Admin already initialized');
}

module.exports = admin;
