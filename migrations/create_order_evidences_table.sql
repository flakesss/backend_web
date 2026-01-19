-- ============================================================================
-- MIGRATION: Create Order Evidences Table
-- ============================================================================
-- Purpose: Enable sellers to upload product photos for orders
-- Buyers can view photos before making payment
-- ============================================================================

-- ============================================================================
-- 1. CREATE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_evidences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Order relationship
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Image storage
  image_url TEXT NOT NULL,
  image_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  
  -- Metadata
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  upload_order INTEGER DEFAULT 0,
  
  -- Soft delete
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

-- Query photos by order (most common query)
CREATE INDEX idx_order_evidences_order_id 
  ON order_evidences(order_id)
  WHERE is_deleted = FALSE;

-- Query active photos
CREATE INDEX idx_order_evidences_active 
  ON order_evidences(is_deleted)
  WHERE is_deleted = FALSE;

-- Query by uploader
CREATE INDEX idx_order_evidences_uploaded_by 
  ON order_evidences(uploaded_by);

-- Sort by upload order
CREATE INDEX idx_order_evidences_upload_order 
  ON order_evidences(order_id, upload_order)
  WHERE is_deleted = FALSE;

-- Sort by created date
CREATE INDEX idx_order_evidences_created_at 
  ON order_evidences(created_at DESC);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE order_evidences ENABLE ROW LEVEL SECURITY;

-- Policy 1: Sellers can view their order evidences
CREATE POLICY "Sellers can view own order evidences"
  ON order_evidences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_evidences.order_id 
      AND orders.seller_id = auth.uid()
    )
  );

-- Policy 2: Sellers can insert evidences for their orders
CREATE POLICY "Sellers can upload evidences for own orders"
  ON order_evidences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_evidences.order_id 
      AND orders.seller_id = auth.uid()
    )
    AND uploaded_by = auth.uid()
  );

-- Policy 3: Sellers can soft-delete their own evidences
CREATE POLICY "Sellers can delete own evidences"
  ON order_evidences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_evidences.order_id 
      AND orders.seller_id = auth.uid()
    )
  );
  -- Note: WITH CHECK removed - seller owns the evidence via USING clause

-- Policy 4: Anyone can view evidences (for order viewing page)
-- Note: In Phase 2, we'll add buyer_id to orders table for better security
CREATE POLICY "Public can view order evidences"
  ON order_evidences FOR SELECT
  USING (is_deleted = FALSE);

-- Policy 5: Admins can view all (including deleted)
CREATE POLICY "Admins can view all evidences"
  ON order_evidences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Policy 6: Admins can delete any evidence
CREATE POLICY "Admins can delete any evidence"
  ON order_evidences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

-- Auto-update timestamp on UPDATE
CREATE OR REPLACE FUNCTION update_order_evidences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_evidences_timestamp
  BEFORE UPDATE ON order_evidences
  FOR EACH ROW
  EXECUTE FUNCTION update_order_evidences_timestamp();

-- Auto-set deleted metadata when soft deleting
CREATE OR REPLACE FUNCTION set_evidence_deleted_metadata()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
    NEW.deleted_at = NOW();
    NEW.deleted_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_evidence_deleted
  BEFORE UPDATE ON order_evidences
  FOR EACH ROW
  WHEN (NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE)
  EXECUTE FUNCTION set_evidence_deleted_metadata();

-- ============================================================================
-- 5. TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE order_evidences IS 'Stores product photos uploaded by sellers for orders';
COMMENT ON COLUMN order_evidences.order_id IS 'Reference to the order this evidence belongs to';
COMMENT ON COLUMN order_evidences.image_url IS 'Full URL to image in Supabase Storage';
COMMENT ON COLUMN order_evidences.image_name IS 'Original filename for reference';
COMMENT ON COLUMN order_evidences.file_size IS 'File size in bytes';
COMMENT ON COLUMN order_evidences.mime_type IS 'Image MIME type (image/jpeg, image/png, etc.)';
COMMENT ON COLUMN order_evidences.uploaded_by IS 'User who uploaded this evidence (should be seller)';
COMMENT ON COLUMN order_evidences.upload_order IS 'Display order for multiple photos (0, 1, 2, ...)';
COMMENT ON COLUMN order_evidences.is_deleted IS 'Soft delete flag - true if deleted';
COMMENT ON COLUMN order_evidences.deleted_at IS 'Timestamp when evidence was deleted';
COMMENT ON COLUMN order_evidences.deleted_by IS 'User who deleted this evidence';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check table created
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'order_evidences'
) as table_exists;

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'order_evidences';

-- Check RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'order_evidences';

-- Check policies
SELECT policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'order_evidences';

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================
/*
-- Drop triggers
DROP TRIGGER IF EXISTS on_evidence_deleted ON order_evidences;
DROP TRIGGER IF EXISTS set_order_evidences_timestamp ON order_evidences;

-- Drop functions
DROP FUNCTION IF EXISTS set_evidence_deleted_metadata();
DROP FUNCTION IF EXISTS update_order_evidences_timestamp();

-- Drop table (cascades to indexes and policies)
DROP TABLE IF EXISTS order_evidences;
*/

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Create Supabase Storage bucket: 'order-evidences'
-- 2. Create backend API endpoints for upload/get/delete
-- 3. Integrate with frontend order creation flow
-- ============================================================================
