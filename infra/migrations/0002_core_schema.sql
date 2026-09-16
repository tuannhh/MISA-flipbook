-- Schema theo ARCHITECTURE.md muc 3. Khoa ngoai ghep tenant_id de ngan
-- lien ket asset/revision/job sang sai tenant ngay ca khi co bug ung dung.

CREATE TABLE tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  quotas          jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_ga_id   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  is_system_admin   boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'creator' CHECK (role IN ('creator')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_memberships_user ON memberships(user_id);

-- books: khong co published_revision_id FK ngay (revisions chua ton tai);
-- FK duoc them sau khi tao bang revisions.
CREATE TABLE books (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  owner_id              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title                 text NOT NULL,
  permalink_slug        text NOT NULL,
  permalink_suffix      text NOT NULL CHECK (permalink_suffix ~ '^[a-z0-9]{8}$'),
  published_revision_id uuid,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'converting', 'ready', 'published', 'error')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permalink_slug, permalink_suffix),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_books_tenant ON books(tenant_id);
CREATE INDEX idx_books_owner ON books(owner_id);
CREATE TRIGGER trg_books_updated_at BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE revisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  book_id           uuid NOT NULL,
  revision_number   integer NOT NULL,
  source_key        text NOT NULL,
  checksum          text NOT NULL,
  pipeline_version  text NOT NULL,
  manifest_key      text,
  state             text NOT NULL DEFAULT 'pending'
                      CHECK (state IN ('pending', 'converting', 'ready', 'failed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, revision_number),
  UNIQUE (id, tenant_id, book_id),
  FOREIGN KEY (tenant_id, book_id) REFERENCES books(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_revisions_tenant ON revisions(tenant_id);
CREATE INDEX idx_revisions_book ON revisions(book_id);

-- Them FK published_revision_id sau khi revisions ton tai; ep phai cung tenant+book.
ALTER TABLE books
  ADD CONSTRAINT fk_books_published_revision
  FOREIGN KEY (published_revision_id, tenant_id, id)
  REFERENCES revisions(id, tenant_id, book_id);

CREATE TABLE book_settings (
  tenant_id           uuid NOT NULL,
  book_id             uuid PRIMARY KEY,
  password_hash       text,
  access_epoch        integer NOT NULL DEFAULT 0,
  allow_download      boolean NOT NULL DEFAULT false,
  ga_id               text,
  thumbnail_asset_id  uuid,
  public_preview      boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, book_id) REFERENCES books(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_book_settings_tenant ON book_settings(tenant_id);
CREATE TRIGGER trg_book_settings_updated_at BEFORE UPDATE ON book_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  book_id       uuid NOT NULL,
  revision_id   uuid NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('source_pdf', 'page_image', 'thumbnail', 'manifest')),
  object_key    text NOT NULL,
  content_type  text NOT NULL,
  bytes         bigint NOT NULL CHECK (bytes >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, book_id) REFERENCES books(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, book_id, revision_id) REFERENCES revisions(tenant_id, book_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_assets_tenant ON assets(tenant_id);
CREATE INDEX idx_assets_revision ON assets(revision_id);

CREATE TABLE jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  book_id           uuid NOT NULL,
  revision_id       uuid NOT NULL,
  idempotency_key   text NOT NULL UNIQUE,
  state             text NOT NULL DEFAULT 'queued'
                      CHECK (state IN ('queued', 'processing', 'done', 'failed')),
  attempts          integer NOT NULL DEFAULT 0,
  progress          integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, book_id, revision_id) REFERENCES revisions(tenant_id, book_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_jobs_tenant ON jobs(tenant_id);
CREATE INDEX idx_jobs_state ON jobs(state);
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- audit_logs: tenant_id NULL cho phep ghi hanh dong cap he thong (vd Admin quan ly tenant).
CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  action        text NOT NULL,
  resource_id   text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);

CREATE TABLE analytics_events (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  book_id             uuid NOT NULL,
  revision_id         uuid,
  event_type          text NOT NULL,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  session_pseudonym   text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (tenant_id, book_id) REFERENCES books(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_analytics_tenant_book ON analytics_events(tenant_id, book_id);
CREATE INDEX idx_analytics_occurred_at ON analytics_events(occurred_at);

CREATE TABLE daily_stats (
  tenant_id   uuid NOT NULL,
  book_id     uuid NOT NULL,
  stat_date   date NOT NULL,
  opens       integer NOT NULL DEFAULT 0,
  page_views  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, book_id, stat_date),
  FOREIGN KEY (tenant_id, book_id) REFERENCES books(tenant_id, id) ON DELETE CASCADE
);
