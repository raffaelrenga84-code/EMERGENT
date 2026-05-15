-- Create expense_attachments table for storing file references
CREATE TABLE IF NOT EXISTS expense_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  file_path VARCHAR NOT NULL,
  file_name VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE expense_attachments ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id ON expense_attachments(expense_id);

-- RLS Policies: Drop existing policies first, then create them
-- (Policies don't support IF NOT EXISTS in PostgreSQL)
DROP POLICY IF EXISTS "Users can view expense attachments in their families" ON expense_attachments;
DROP POLICY IF EXISTS "Users can insert expense attachments for expenses in their families" ON expense_attachments;
DROP POLICY IF EXISTS "Users can delete expense attachments they have access to" ON expense_attachments;

CREATE POLICY "Users can view expense attachments in their families"
  ON expense_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND e.id = expense_attachments.expense_id
    )
  );

CREATE POLICY "Users can insert expense attachments for expenses in their families"
  ON expense_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND e.id = expense_attachments.expense_id
    )
  );

CREATE POLICY "Users can delete expense attachments they have access to"
  ON expense_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND e.id = expense_attachments.expense_id
    )
  );

-- Create expense-attachments storage bucket (if doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-attachments', 'expense-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage bucket - Drop and recreate
DROP POLICY IF EXISTS "Users can upload expense attachments in their families" ON storage.objects;
DROP POLICY IF EXISTS "Users can view expense attachments in their families" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete expense attachments they have access to" ON storage.objects;

CREATE POLICY "Users can upload expense attachments in their families"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'expense-attachments' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can view expense attachments in their families"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'expense-attachments' AND
    EXISTS (
      SELECT 1 FROM expense_attachments ea
      JOIN expenses e ON ea.expense_id = e.id
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND ea.file_path = storage.objects.name
    )
  );

CREATE POLICY "Users can delete expense attachments they have access to"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'expense-attachments' AND
    EXISTS (
      SELECT 1 FROM expense_attachments ea
      JOIN expenses e ON ea.expense_id = e.id
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND ea.file_path = storage.objects.name
    )
  );
