ALTER TABLE approval_events
ADD COLUMN IF NOT EXISTS conversation_session_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL;
