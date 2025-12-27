/**
 * QRIS Utility Functions
 * Based on QRIS Indonesia Standard
 * 
 * Functions:
 * - generateDynamicQRIS: Convert static QRIS to dynamic with amount
 * - crc16: Calculate CRC16 checksum for QRIS integrity
 */

/**
 * Generate CRC16 checksum (CRC-16/CCITT-FALSE)
 * Used to validate QRIS data integrity
 * 
 * @param {string} str - The QRIS payload string
 * @returns {string} - 4-character hex checksum (e.g., "B25D")
 */
const crc16 = (str) => {
    let crc = 0xFFFF;

    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;

        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }

    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

/**
 * Generate Dynamic QRIS from Static QRIS
 * 
 * Process:
 * 1. Remove old CRC (last 4 chars)
 * 2. Change indicator from static (11) to dynamic (12)
 * 3. Inject amount tag (54LLAAMOUNT)
 * 4. Calculate new CRC16 checksum
 * 5. Return complete dynamic QRIS string
 * 
 * @param {string} staticQris - Base QRIS string from merchant
 * @param {number} amount - Payment amount in IDR (integer)
 * @returns {string} - Dynamic QRIS string ready to be displayed as QR
 * @throws {Error} - If QRIS format is invalid
 */
const generateDynamicQRIS = (staticQris, amount) => {
    // Validate inputs
    if (!staticQris || typeof staticQris !== 'string') {
        throw new Error('Invalid QRIS string');
    }

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
        throw new Error('Amount must be a positive integer');
    }

    try {
        // Step 1: Remove old CRC (last 4 characters)
        const qrisWithoutCrc = staticQris.substring(0, staticQris.length - 4);

        // Step 2: Change to dynamic (010211 → 010212)
        // Tag 01, length 02, value changes from 11 (static) to 12 (dynamic)
        const dynamicQris = qrisWithoutCrc.replace("010211", "010212");

        // Step 3: Split by country code identifier
        // Country code is always 5802ID for Indonesia
        const parts = dynamicQris.split("5802ID");

        if (parts.length !== 2) {
            throw new Error("Invalid QRIS format: country code not found");
        }

        // Step 4: Create amount tag
        // Format: Tag(54) + Length(LL) + Amount(AMOUNT)
        // Example: 50000 → 54 + 05 + 50000 = "540550000"
        const amountStr = String(parseInt(amount));
        const lengthStr = String(amountStr.length).padStart(2, '0');
        const amountTag = "54" + lengthStr + amountStr;

        // Step 5: Combine parts with amount tag inserted before country code
        const payload = parts[0] + amountTag + "5802ID" + parts[1];

        // Step 6: Calculate new CRC16 checksum
        const newCrc = crc16(payload);

        // Step 7: Return complete dynamic QRIS
        return payload + newCrc;

    } catch (err) {
        console.error('Generate QRIS error:', err);
        throw new Error(`Failed to generate dynamic QRIS: ${err.message}`);
    }
};

/**
 * Validate QRIS string format (basic validation)
 * 
 * @param {string} qrisString - QRIS string to validate
 * @returns {boolean} - true if valid format
 */
const validateQRISFormat = (qrisString) => {
    if (!qrisString || typeof qrisString !== 'string') {
        return false;
    }

    // Basic checks
    if (qrisString.length < 100) return false; // QRIS is typically 200+ chars
    if (!qrisString.startsWith('00020101')) return false; // Must start with version
    if (!qrisString.includes('5802ID')) return false; // Must have country code

    return true;
};

/**
 * Extract merchant info from QRIS (if available)
 * 
 * @param {string} qrisString - QRIS string
 * @returns {object} - Merchant info (name, city, etc.)
 */
const extractMerchantInfo = (qrisString) => {
    const info = {
        merchantName: null,
        merchantCity: null
    };

    try {
        // Tag 59 = Merchant Name
        const nameMatch = qrisString.match(/59(\d{2})(.+?)(?=60|61|62|63)/);
        if (nameMatch) {
            const length = parseInt(nameMatch[1]);
            info.merchantName = nameMatch[2].substring(0, length);
        }

        // Tag 60 = Merchant City
        const cityMatch = qrisString.match(/60(\d{2})(.+?)(?=61|62|63)/);
        if (cityMatch) {
            const length = parseInt(cityMatch[1]);
            info.merchantCity = cityMatch[2].substring(0, length);
        }
    } catch (err) {
        console.error('Extract merchant info error:', err);
    }

    return info;
};

module.exports = {
    generateDynamicQRIS,
    crc16,
    validateQRISFormat,
    extractMerchantInfo
};
