-- Supports the Admin published-book table's keyset pagination and date range filter.
CREATE INDEX IF NOT EXISTS idx_books_admin_published_cursor
  ON books (published_at DESC, id DESC)
  WHERE status = 'published' AND deleted_at IS NULL;
