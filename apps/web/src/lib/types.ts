export interface Membership {
  tenantId: string;
  tenantName: string;
  role: string;
  status: string;
}

export interface Me {
  id: string;
  email: string;
  isSystemAdmin: boolean;
  memberships: Membership[];
}

export interface Book {
  id: string;
  title: string;
  permalink_slug: string;
  permalink_suffix: string;
  status: "draft" | "converting" | "ready" | "published" | "error";
  published_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Revision {
  id: string;
  revision_number: number;
  state: "pending" | "converting" | "ready" | "failed";
  checksum: string;
  created_at: string;
}

export interface JobStatus {
  id: string;
  book_id: string;
  revision_id: string;
  state: "queued" | "processing" | "done" | "failed";
  attempts: number;
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReaderPage {
  page: number;
  widthPt: number;
  heightPt: number;
  rotation: number;
  links: Array<{ type: string; target: string | null; rect_norm: number[] }>;
  imageAssetId: string | null;
  thumbAssetId: string | null;
}

export interface PreviewResult {
  revisionId: string;
  revisionNumber: number;
  state: string;
  pages: ReaderPage[];
}

export interface PublicBook {
  title: string;
  permalink: string;
  allowDownload: boolean;
  pages: ReaderPage[];
}

export interface BookSettings {
  allow_download: boolean;
  thumbnail_asset_id: string | null;
  ga_id: string | null;
  has_password: boolean;
}
