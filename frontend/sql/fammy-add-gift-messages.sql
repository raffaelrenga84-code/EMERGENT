-- Create gift_messages table for gift coordination conversations
CREATE TABLE gift_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  birthday_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  author_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX idx_gift_messages_birthday ON gift_messages(birthday_member_id);
CREATE INDEX idx_gift_messages_family ON gift_messages(family_id);

-- Enable RLS
ALTER TABLE gift_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see messages for their family's birthday events
CREATE POLICY "Users can view family gift messages"
  ON gift_messages FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can create messages for their family
CREATE POLICY "Users can create gift messages in their family"
  ON gift_messages FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM members WHERE user_id = auth.uid()
    )
  );
