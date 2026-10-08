-- Credentials are stored only as authenticated AES-GCM ciphertext.
CREATE TABLE IF NOT EXISTS analytics_connections (
 project TEXT PRIMARY KEY,
 ciphertext TEXT NOT NULL,
 iv TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS analytics_login_attempts (
 client TEXT NOT NULL,
 bucket INTEGER NOT NULL,
 n INTEGER NOT NULL,
 PRIMARY KEY(client,bucket)
);
