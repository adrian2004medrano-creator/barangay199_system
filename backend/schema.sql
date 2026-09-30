-- Barangay 199 Information & Resident Management System
-- Run this once in the Supabase SQL Editor (or via `psql` against your Supabase
-- connection string) before starting the backend. The backend also creates/
-- migrates these tables automatically on startup, so running this manually is
-- optional but recommended for a clean first setup.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  middle_initial VARCHAR(30),
  last_name VARCHAR(100) NOT NULL,
  age INT NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  position VARCHAR(100) NOT NULL DEFAULT '',
  profile_picture VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS residents (
  id SERIAL PRIMARY KEY,
  photo VARCHAR(255),
  first_name VARCHAR(100) NOT NULL,
  middle_initial VARCHAR(30),
  last_name VARCHAR(150) NOT NULL,
  name VARCHAR(255) NOT NULL,
  age INT,
  sex VARCHAR(50),
  civil_status VARCHAR(100),
  birthdate DATE,
  birthplace VARCHAR(255),
  address VARCHAR(255) NOT NULL,
  purok VARCHAR(100),
  contact_number VARCHAR(50),
  occupation VARCHAR(255),
  voter_status VARCHAR(50),
  household_no VARCHAR(100),
  date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_residents_name ON residents (name);
CREATE INDEX IF NOT EXISTS idx_residents_purok ON residents (purok);

CREATE TABLE IF NOT EXISTS certificate_requests (
  id SERIAL PRIMARY KEY,
  resident_id INT REFERENCES residents(id) ON DELETE SET NULL,
  requestor_name VARCHAR(255) NOT NULL,
  certificate_type VARCHAR(100) NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  remarks VARCHAR(500),
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  processed_by INT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_certificate_requests_status ON certificate_requests (status, requested_at);

CREATE TABLE IF NOT EXISTS blotter_reports (
  id SERIAL PRIMARY KEY,
  case_no VARCHAR(50) UNIQUE NOT NULL,
  complainant_name VARCHAR(255) NOT NULL,
  respondent_name VARCHAR(255) NOT NULL,
  incident_type VARCHAR(150) NOT NULL,
  incident_date DATE,
  incident_location VARCHAR(255),
  narrative TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  filed_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blotter_status ON blotter_reports (status, created_at);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  posted_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements (created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INT,
  message VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS team_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_team_chat_sender ON team_chat_messages (sender_id);

CREATE TABLE IF NOT EXISTS team_chat_conversation_clears (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cleared_through_id BIGINT NOT NULL DEFAULT 0,
  cleared_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP,
  deleted_at TIMESTAMP,
  sender_hidden_at TIMESTAMP,
  recipient_hidden_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_private_chat_sender_recipient ON private_chat_messages (sender_id, recipient_id, id);
CREATE INDEX IF NOT EXISTS idx_private_chat_recipient_sender ON private_chat_messages (recipient_id, sender_id, id);
