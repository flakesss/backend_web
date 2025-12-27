// Password Validation Utility
// Ensures password meets security requirements

const validatePasswordStrength = (password) => {
    const requirements = {
        minLength: password.length >= 8,
        hasUpperCase: /[A-Z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSymbol: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };

    const allRequirementsMet = Object.values(requirements).every(req => req === true);

    return {
        isValid: allRequirementsMet,
        requirements,
        message: allRequirementsMet
            ? 'Password is strong'
            : 'Password does not meet security requirements'
    };
};

const getPasswordErrorMessage = (requirements) => {
    const missing = [];

    if (!requirements.minLength) missing.push('minimal 8 karakter');
    if (!requirements.hasUpperCase) missing.push('huruf besar (A-Z)');
    if (!requirements.hasNumber) missing.push('angka (0-9)');
    if (!requirements.hasSymbol) missing.push('simbol (!@#$%^&*)');

    if (missing.length === 0) return null;

    return `Password harus mengandung: ${missing.join(', ')}`;
};

module.exports = {
    validatePasswordStrength,
    getPasswordErrorMessage
};
