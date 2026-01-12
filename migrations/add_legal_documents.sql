-- Migration: Legal Documents Table
-- Stores Terms of Service and Privacy Policy in database
-- Allows version control and easy updates without code changes

-- Drop existing table if exists (for clean migration)
DROP TABLE IF EXISTS legal_documents CASCADE;

-- Create legal_documents table
CREATE TABLE legal_documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- 'terms_of_service' or 'privacy_policy'
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL, -- Full markdown content
    version VARCHAR(20) NOT NULL, -- e.g. "1.0", "1.1"
    effective_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

-- Create partial unique index to ensure only one active document per type
-- This replaces the constraint with WHERE clause
CREATE UNIQUE INDEX unique_active_document_per_type 
    ON legal_documents(type) 
    WHERE is_active = true;

-- Create indexes for faster queries
CREATE INDEX idx_legal_documents_type ON legal_documents(type);
CREATE INDEX idx_legal_documents_active ON legal_documents(is_active);
CREATE INDEX idx_legal_documents_type_active ON legal_documents(type, is_active);

-- Create user_legal_acceptances table (track who accepted what)
CREATE TABLE user_legal_acceptances (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    document_id UUID REFERENCES legal_documents(id),
    document_type VARCHAR(50) NOT NULL, -- Denormalize for faster queries
    document_version VARCHAR(20) NOT NULL,
    accepted_at TIMESTAMP DEFAULT NOW(),
    ip_address INET, -- Track IP for legal purposes
    user_agent TEXT, -- Track device/browser
    
    -- Each user can only accept a specific document version once
    CONSTRAINT unique_user_document_acceptance 
        UNIQUE (user_id, document_id)
);

-- Create indexes
CREATE INDEX idx_user_acceptances_user ON user_legal_acceptances(user_id);
CREATE INDEX idx_user_acceptances_document ON user_legal_acceptances(document_id);
CREATE INDEX idx_user_acceptances_type ON user_legal_acceptances(document_type);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_legal_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_legal_documents_updated_at
    BEFORE UPDATE ON legal_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_legal_documents_updated_at();

-- Helper function: Get active document by type
CREATE OR REPLACE FUNCTION get_active_legal_document(doc_type VARCHAR)
RETURNS TABLE (
    id UUID,
    type VARCHAR,
    title VARCHAR,
    content TEXT,
    version VARCHAR,
    effective_date DATE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ld.id,
        ld.type,
        ld.title,
        ld.content,
        ld.version,
        ld.effective_date,
        ld.created_at,
        ld.updated_at
    FROM legal_documents ld
    WHERE ld.type = doc_type
      AND ld.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Check if user accepted current version
CREATE OR REPLACE FUNCTION has_user_accepted_current_terms(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_terms_version VARCHAR;
    user_accepted_version VARCHAR;
BEGIN
    -- Get current active terms version
    SELECT version INTO current_terms_version
    FROM legal_documents
    WHERE type = 'terms_of_service'
      AND is_active = true
    LIMIT 1;
    
    -- Get user's latest accepted version
    SELECT document_version INTO user_accepted_version
    FROM user_legal_acceptances
    WHERE user_id = p_user_id
      AND document_type = 'terms_of_service'
    ORDER BY accepted_at DESC
    LIMIT 1;
    
    -- Return true if versions match
    RETURN (user_accepted_version = current_terms_version);
END;
$$ LANGUAGE plpgsql;

-- View: Latest acceptances per user
CREATE OR REPLACE VIEW user_latest_legal_acceptances AS
SELECT DISTINCT ON (user_id, document_type)
    user_id,
    document_type,
    document_version,
    accepted_at,
    ip_address
FROM user_legal_acceptances
ORDER BY user_id, document_type, accepted_at DESC;

-- Comments
COMMENT ON TABLE legal_documents IS 'Stores Terms of Service and Privacy Policy documents with version control';
COMMENT ON TABLE user_legal_acceptances IS 'Tracks which users accepted which document versions and when';
COMMENT ON COLUMN legal_documents.type IS 'Document type: terms_of_service or privacy_policy';
COMMENT ON COLUMN legal_documents.is_active IS 'Only one document per type can be active at a time';
COMMENT ON COLUMN user_legal_acceptances.ip_address IS 'IP address when user accepted (for legal audit trail)';

-- Insert initial Terms of Service (from your markdown file)
INSERT INTO legal_documents (type, title, version, effective_date, is_active, content)
VALUES (
    'terms_of_service',
    'Syarat dan Ketentuan Layanan Flocify',
    '1.0',
    '2026-01-12',
    true,
    '# SYARAT DAN KETENTUAN LAYANAN FLOCIFY

[FULL CONTENT WILL BE INSERTED VIA BACKEND API]

Terakhir diperbarui: 12 Januari 2026
Versi: 1.0'
);

-- Insert initial Privacy Policy
INSERT INTO legal_documents (type, title, version, effective_date, is_active, content)
VALUES (
    'privacy_policy',
    'Kebijakan Privasi Flocify',
    '1.0',
    '2026-01-12',
    true,
    '# KEBIJAKAN PRIVASI FLOCIFY

[FULL CONTENT WILL BE INSERTED VIA BACKEND API]

Terakhir diperbarui: 12 Januari 2026
Versi: 1.0'
);

-- Grant permissions (if using RLS)
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Public can read active legal documents
CREATE POLICY "Anyone can view active legal documents"
    ON legal_documents FOR SELECT
    USING (is_active = true);

-- Users can insert their own acceptances
CREATE POLICY "Users can accept legal documents"
    ON user_legal_acceptances FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own acceptances
CREATE POLICY "Users can view their own acceptances"
    ON user_legal_acceptances FOR SELECT
    USING (auth.uid() = user_id);

-- Admin can do everything (adjust based on your admin setup)
CREATE POLICY "Admins can manage legal documents"
    ON legal_documents
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );
