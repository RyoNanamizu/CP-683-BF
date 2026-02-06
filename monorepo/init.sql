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

-- Create credentials table for WebAuthn
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle VARCHAR(255) NOT NULL UNIQUE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create index on handle for faster lookups
CREATE INDEX IF NOT EXISTS idx_credentials_handle ON credentials(handle);
CREATE INDEX IF NOT EXISTS idx_credentials_credential_id ON credentials(credential_id);

-- Create challenges table for temporary storage
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle VARCHAR(255) NOT NULL,
  challenge TEXT NOT NULL,
  challenge_type VARCHAR(50) NOT NULL, -- 'registration' or 'login'
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create index on handle and expiry for cleanup
CREATE INDEX IF NOT EXISTS idx_challenges_handle_expires ON challenges(handle, expires_at);

