-- Create messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  ring_public_keys BYTEA[] NOT NULL,
  outer_signature BYTEA NOT NULL,
  encrypted_proof BYTEA NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create index on created_at for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
