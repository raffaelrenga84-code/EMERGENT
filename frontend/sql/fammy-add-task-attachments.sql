-- Create task_attachments table for storing file references
CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path VARCHAR NOT NULL,
  file_name VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);

-- RLS Policies: Drop existing policies first, then create them
-- (Policies don't support IF NOT EXISTS in PostgreSQL)
DROP POLICY IF EXISTS "Users can view task attachments in their families" ON task_attachments;
DROP POLICY IF EXISTS "Users can insert task attachments for tasks in their families" ON task_attachments;
DROP POLICY IF EXISTS "Users can delete task attachments they created" ON task_attachments;

CREATE POLICY "Users can view task attachments in their families"
  ON task_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND t.id = task_attachments.task_id
    )
  );

CREATE POLICY "Users can insert task attachments for tasks in their families"
  ON task_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND t.id = task_attachments.task_id
    )
  );

CREATE POLICY "Users can delete task attachments they created"
  ON task_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND t.id = task_attachments.task_id
    )
  );

-- Create task-attachments storage bucket (if doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage bucket - Drop and recreate
DROP POLICY IF EXISTS "Users can upload task attachments in their families" ON storage.objects;
DROP POLICY IF EXISTS "Users can view task attachments in their families" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete task attachments they have access to" ON storage.objects;

CREATE POLICY "Users can upload task attachments in their families"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'task-attachments' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can view task attachments in their families"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'task-attachments' AND
    EXISTS (
      SELECT 1 FROM task_attachments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND ta.file_path = storage.objects.name
    )
  );

CREATE POLICY "Users can delete task attachments they have access to"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'task-attachments' AND
    EXISTS (
      SELECT 1 FROM task_attachments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND ta.file_path = storage.objects.name
    )
  );
