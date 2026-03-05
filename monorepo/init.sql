-- Tables for CP683 database
-- Ensure gen_random_uuid() is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create credentials table for WebAuthn
CREATE TABLE
  IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    handle VARCHAR(255) NOT NULL UNIQUE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now (),
    updated_at TIMESTAMP NOT NULL DEFAULT now ()
  );

-- Create index on handle for faster lookups
CREATE INDEX IF NOT EXISTS idx_credentials_handle ON credentials (handle);

CREATE INDEX IF NOT EXISTS idx_credentials_credential_id ON credentials (credential_id);

-- Create challenges table for temporary storage
CREATE TABLE
  IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    handle VARCHAR(255) NOT NULL,
    challenge TEXT NOT NULL,
    challenge_type VARCHAR(50) NOT NULL, -- 'registration' or 'login'
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now ()
  );

-- Create index on handle and expiry for cleanup
CREATE INDEX IF NOT EXISTS idx_challenges_handle_expires ON challenges (handle, expires_at);

-- Create sessions table for storing authentication sessions
CREATE TABLE
  IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    handle VARCHAR(255) NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now (),
    updated_at TIMESTAMP NOT NULL DEFAULT now ()
  );

-- Create index on session_token and expires_at for fast lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (session_token);

CREATE INDEX IF NOT EXISTS idx_sessions_handle ON sessions (handle);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- Create message_packs table for storing bearer assets
CREATE TABLE
  IF NOT EXISTS message_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    content TEXT NOT NULL, -- JSON string of MessagePack
    owner VARCHAR(255) NOT NULL, -- username (owner of the bearer asset)
    timestamp TIMESTAMP NOT NULL DEFAULT now (), -- ISO8601 timestamp
    created_at TIMESTAMP NOT NULL DEFAULT now ()
  );

-- Create indexes for message_packs
CREATE INDEX IF NOT EXISTS idx_message_packs_owner ON message_packs (owner);

CREATE INDEX IF NOT EXISTS idx_message_packs_timestamp ON message_packs (timestamp);

-- Create indexes for Validation Requests
CREATE TABLE
  IF NOT EXISTS validation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    message_pack_id UUID NOT NULL REFERENCES message_packs (id) ON DELETE CASCADE,
    requester VARCHAR(255) NOT NULL,
    responder VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (
      status IN (
        'Pending',
        'Replied',
        'Passed',
        'Failed',
        'Refused',
        'Error'
      )
    ),
    response_payload TEXT NULL, -- Responder evidence payload
    created_at TIMESTAMP NOT NULL DEFAULT now (),
    updated_at TIMESTAMP NOT NULL DEFAULT now ()
  );

-- Create indexes for Sent/Received list performance
CREATE INDEX IF NOT EXISTS idx_validation_requests_requester_created_at ON validation_requests (requester, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_requests_responder_created_at ON validation_requests (responder, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_requests_message_pack_id ON validation_requests (message_pack_id);