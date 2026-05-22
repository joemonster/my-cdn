ALTER TABLE files ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at);
