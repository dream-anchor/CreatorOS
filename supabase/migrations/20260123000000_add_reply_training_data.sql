-- Create table for storing reply training data (feedback loop)
CREATE TABLE IF NOT EXISTS reply_training_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    comment_text TEXT NOT NULL,
    original_ai_reply TEXT,
    better_reply TEXT NOT NULL,
    correction_reason TEXT, -- e.g. "too_formal", "wrong_info", "too_long", "custom"
    correction_note TEXT,   -- Optional custom note
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_to_model BOOLEAN DEFAULT FALSE -- To track if this data has been used for fine-tuning/RAG
);

-- Enable RLS
ALTER TABLE reply_training_data ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see/edit their own training data
CREATE POLICY "Users can manage their own training data" 
ON reply_training_data
FOR ALL 
USING (auth.uid() = user_id);

-- Create index for faster querying during RAG/training
CREATE INDEX IF NOT EXISTS idx_reply_training_user_created 
ON reply_training_data(user_id, created_at DESC);
