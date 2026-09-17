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
  /** F13-simplification: moc dang lan dau (null neu chua tung publish) - xem publish() trong books.controller.ts. */
  published_at: string | null;
  /** F12: tong dung luong (bytes) cua moi asset thuoc sach (moi revision cong don). */
  storage_bytes: number;
  /** F12: tong luot mo / luot xem trang trong 30 ngay gan nhat. */
  opens_30d: number;
  page_views_30d: number;
}

/** F12: 1 dong thong ke theo ngay (GET /books/:id/stats). */
export interface DailyStat {
  stat_date: string;
  opens: number;
  page_views: number;
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
  links: Array<{
    type: "external_uri" | "internal_goto" | "unsupported_action";
    target: string | number | null;
    rect_norm: number[];
  }>;
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
  /** F15: co anh nen backdrop hay khong (URL suy ra tu permalink, xem PublicBookReader). */
  hasBackground: boolean;
  /** F06: GA4 Measurement ID DA la gia tri hieu luc (uu tien sach, fallback tenant). */
  gaId: string | null;
  pages: ReaderPage[];
}

/** F13-simplification: 1 dong sach DA DANG trong danh sach Admin (GET /admin/books) -
 * thay cho bang Tenants/bang sach xuyen-tenant day so lieu ky thuat truoc day. tenant_id
 * giu lai CHI de FE dieu huong sang trang chi tiet sach (xem BookDetailPage muc
 * "tenantId override"), khong hien thi truc tiep tren bang. */
export interface AdminBook {
  id: string;
  title: string;
  tenant_id: string;
  owner_email: string;
  published_at: string | null;
  views: number;
}

/** F13-simplification: so lieu tong quan Admin dashboard (GET /admin/stats) - rut gon
 * tu 7 so xuong 2 (bo tenant/user/storage/failed-job/30-ngay/"time on site" theo yeu
 * cau don gian hoa cho nguoi dung khong ky thuat). */
export interface AdminStats {
  published_count: number;
  total_opens: number;
}

export interface BookSettings {
  allow_download: boolean;
  thumbnail_asset_id: string | null;
  ga_id: string | null;
  has_password: boolean;
  /** F16: cong tac Publish/Private tren sach da publish (khac Book["status"]). */
  visibility: "public" | "private";
  /** F15: da upload anh nen backdrop cho khung doc hay chua. */
  has_background: boolean;
}
