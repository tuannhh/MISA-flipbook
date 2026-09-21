import * as crypto from "crypto";
import * as argon2 from "argon2";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  SetMetadata,
  ConflictException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { DbContextInterceptor } from "../../common/tenant/db-context.interceptor";
import { RequireTenant } from "../../common/tenant/require-tenant.decorator";
import { AuthedRequest } from "../../common/tenant/authed-request";
import { STORAGE_ADAPTER, StorageAdapter } from "../../storage/storage.interface";
import { CreateBookDto } from "./dto/create-book.dto";
import { PublishBookDto } from "./dto/publish-book.dto";
import { UpdateBookDto } from "./dto/update-book.dto";
import { UpdateBookSettingsDto } from "./dto/update-book-settings.dto";
import { randomSuffix8, slugifyVietnamese } from "./util/slugify";
import { buildReaderPages } from "./util/build-reader-pages";
import { RateLimitService } from "../../common/rate-limit/rate-limit.service";
import { PDF_UPLOAD } from "../../common/tenant/pdf-upload";

const PDF_MAX_BYTES = Number(process.env.PDF_MAX_BYTES ?? 200 * 1024 * 1024);
const PIPELINE_VERSION = process.env.PDF_PIPELINE_VERSION ?? "v1";
const MAX_SLUG_RETRIES = 5;

// F15: anh nen cho sach (backdrop, khac han page_image/thumbnail von do PDF-worker
// sinh ra) - gioi han rieng, nho hon PDF vi chi la 1 anh trang tri.
const BACKGROUND_MAX_BYTES = Number(process.env.BOOK_BACKGROUND_MAX_BYTES ?? 8 * 1024 * 1024);
const BACKGROUND_SIGNATURES: Array<{ contentType: string; check: (buf: Buffer) => boolean }> = [
  { contentType: "image/png", check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { contentType: "image/jpeg", check: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { contentType: "image/webp", check: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

// coverAssetId: uu tien thumbnail Creator tu chon (book_settings.thumbnail_asset_id),
// khong thi lay thumbnail trang dau cua revision DANG PUBLISH (chua publish thi
// chua co anh bia cong khai - dashboard hien placeholder, tranh lo anh cua revision
// chua duyet ra ngoai qua duong public asset).
// F12: dung luong (tong bytes moi revision cua sach) + luot mo/luot xem trang 30 ngay gan
// nhat (SUM tren daily_stats, da co RLS rieng gioi han dung sach cua chinh minh - xem
// 0003_rls_policies.sql). Subquery tuong quan, chap nhan duoc o quy mo PoC (danh sach sach
// cua 1 Creator khong lon).
const BOOK_SELECT_COLUMNS = `
  b.id, b.title, b.permalink_slug, b.permalink_suffix, b.status, b.published_revision_id,
  b.created_at, b.updated_at, b.published_at,
  COALESCE(
    bs.thumbnail_asset_id,
    (SELECT a.id FROM assets a
     WHERE a.book_id = b.id AND a.revision_id = b.published_revision_id AND a.kind = 'thumbnail'
     ORDER BY a.object_key LIMIT 1)
  ) AS cover_asset_id,
  (SELECT COALESCE(SUM(a.bytes), 0) FROM assets a WHERE a.book_id = b.id) AS storage_bytes,
  (SELECT COALESCE(SUM(ds.opens), 0) FROM daily_stats ds
   WHERE ds.book_id = b.id AND ds.stat_date >= CURRENT_DATE - INTERVAL '30 days') AS opens_30d,
  (SELECT COALESCE(SUM(ds.page_views), 0) FROM daily_stats ds
   WHERE ds.book_id = b.id AND ds.stat_date >= CURRENT_DATE - INTERVAL '30 days') AS page_views_30d
`;

@Controller("books")
@UseGuards(JwtAuthGuard)
@UseInterceptors(DbContextInterceptor)
@RequireTenant()
export class BooksController {
  constructor(
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly rateLimit: RateLimitService
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest) {
    // RLS (books_owner_read) da gioi han chi sach cua chinh nguoi goi trong tenant nay.
    // deleted_at: sach bi Admin xoa mem khong con hien trong danh sach cua Creator nua.
    const { rows } = await req.dbClient.query(
      `SELECT ${BOOK_SELECT_COLUMNS} FROM books b
       LEFT JOIN book_settings bs ON bs.book_id = b.id
       WHERE b.deleted_at IS NULL
       ORDER BY b.created_at DESC`
    );
    return rows;
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateBookDto) {
    const baseSlug = slugifyVietnamese(dto.title);
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      const suffix = randomSuffix8();
      const { rows } = await req.dbClient.query(
        `INSERT INTO books (tenant_id, owner_id, title, permalink_slug, permalink_suffix)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (permalink_slug, permalink_suffix) DO NOTHING
           RETURNING id, title, permalink_slug, permalink_suffix, status, created_at`,
        [req.tenantId, req.userId, dto.title, baseSlug, suffix]
      );
      if (rows.length) return rows[0];
    }
    throw new BadRequestException(
      `Khong tao duoc permalink duy nhat sau ${MAX_SLUG_RETRIES} lan thu.`
    );
  }

  @Get(":id")
  async getOne(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { rows } = await req.dbClient.query(
      `SELECT ${BOOK_SELECT_COLUMNS} FROM books b
       LEFT JOIN book_settings bs ON bs.book_id = b.id
       WHERE b.id = $1 AND b.deleted_at IS NULL`,
      [id]
    );
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    return rows[0];
  }

  @Post(":id/upload")
  @SetMetadata(PDF_UPLOAD, true)
  async upload(
    @Req() req: AuthedRequest,
    @Param("id") bookId: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("Thieu file PDF (field 'file').");
    }
    if (file.size > PDF_MAX_BYTES) {
      throw new BadRequestException(`File vuot qua gioi han ${PDF_MAX_BYTES} bytes.`);
    }

    // Serialize quota admission per tenant and revision numbering per book.
    await req.dbClient.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [req.tenantId]);
    const bookRes = await req.dbClient.query("SELECT id FROM books WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [bookId]);
    if (bookRes.rowCount === 0) {
      // RLS da loc: hoac khong ton tai, hoac khong phai sach cua nguoi goi -> 404 chung,
      // khong tiet lo su khac biet (tranh do tim ID sach nguoi khac).
      throw new NotFoundException("Khong tim thay sach.");
    }

    const revNumRes = await req.dbClient.query(
      "SELECT COALESCE(MAX(revision_number), 0) + 1 AS next FROM revisions WHERE book_id = $1",
      [bookId]
    );
    const revisionNumber = revNumRes.rows[0].next as number;
    const revisionId = crypto.randomUUID();
    const checksum = req.pdfChecksum!;
    const objectKey = `${req.tenantId}/${bookId}/${revisionId}/source.pdf`;

    const budget = await req.dbClient.query("SELECT * FROM upload_tenant_budget($1)", [req.tenantId]);
    const usage = budget.rows[0];
    const maxSource = Number(usage.quotas?.source_bytes ?? process.env.TENANT_SOURCE_BYTES ?? 10737418240);
    const maxJobs = Number(usage.quotas?.pending_jobs ?? process.env.TENANT_PENDING_JOBS ?? 20);
    if (Number(usage.source_bytes) + file.size > maxSource || Number(usage.pending_jobs) >= maxJobs) {
      throw new ConflictException("Tenant da vuot han muc dung luong PDF hoac so job dang cho.");
    }

    await this.storage.adoptFile(objectKey, file.path);
    req.rollbackFiles?.push(this.storage.getAbsolutePath(objectKey));

    await req.dbClient.query(
      `INSERT INTO revisions (id, tenant_id, book_id, revision_number, source_key, checksum, pipeline_version, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [revisionId, req.tenantId, bookId, revisionNumber, objectKey, checksum, PIPELINE_VERSION]
    );
    await req.dbClient.query(
      `INSERT INTO assets (tenant_id, book_id, revision_id, kind, object_key, content_type, bytes)
       VALUES ($1,$2,$3,'source_pdf',$4,'application/pdf',$5)`,
      [req.tenantId, bookId, revisionId, objectKey, file.size]
    );

    const idempotencyKey = `revision:${revisionId}:pipeline:${PIPELINE_VERSION}`;
    const jobRes = await req.dbClient.query(
      `INSERT INTO jobs (tenant_id, book_id, revision_id, idempotency_key, state)
       VALUES ($1,$2,$3,$4,'queued')
       RETURNING id, state`,
      [req.tenantId, bookId, revisionId, idempotencyKey]
    );

    return {
      revisionId,
      revisionNumber,
      jobId: jobRes.rows[0].id,
      jobState: jobRes.rows[0].state,
      bytes: file.size,
      checksum,
    };
  }

  @Patch(":id")
  async update(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: UpdateBookDto) {
    if (dto.title === undefined) {
      return this.getOne(req, id);
    }
    const updateRes = await req.dbClient.query(`UPDATE books SET title = $1 WHERE id = $2 RETURNING id`, [
      dto.title,
      id,
    ]);
    if (updateRes.rowCount === 0) {
      // RLS (books_owner_write) da loc: khong ton tai hoac khong phai chu sach.
      throw new NotFoundException("Khong tim thay sach.");
    }
    return this.getOne(req, id);
  }

  @Get(":id/revisions")
  async listRevisions(@Req() req: AuthedRequest, @Param("id") bookId: string) {
    const { rows } = await req.dbClient.query(
      `SELECT id, revision_number, state, checksum, created_at
       FROM revisions WHERE book_id = $1 ORDER BY revision_number DESC`,
      [bookId]
    );
    return rows;
  }

  /** Xem truoc 1 revision (chua can publish) - buoc "preview" giua upload va publish. */
  @Get(":id/preview")
  async preview(
    @Req() req: AuthedRequest,
    @Param("id") bookId: string,
    @Query("revisionId") revisionId?: string
  ) {
    const revision = await this.resolvePreviewRevision(req, bookId, revisionId);
    const manifest = JSON.parse((await this.storage.readBuffer(revision.manifest_key)).toString("utf8"));
    const assetsRes = await req.dbClient.query(
      `SELECT id, kind, object_key FROM assets
       WHERE book_id = $1 AND revision_id = $2 AND kind IN ('page_image','thumbnail')
       ORDER BY object_key`,
      [bookId, revision.id]
    );
    return {
      revisionId: revision.id,
      revisionNumber: revision.revision_number,
      state: revision.state,
      pages: buildReaderPages(manifest, assetsRes.rows),
    };
  }

  private async resolvePreviewRevision(req: AuthedRequest, bookId: string, revisionId?: string) {
    const query = revisionId
      ? req.dbClient.query(
          `SELECT id, revision_number, state, manifest_key FROM revisions WHERE id = $1 AND book_id = $2`,
          [revisionId, bookId]
        )
      : req.dbClient.query(
          `SELECT id, revision_number, state, manifest_key FROM revisions
           WHERE book_id = $1 AND state = 'ready' ORDER BY revision_number DESC LIMIT 1`,
          [bookId]
        );
    const { rows } = await query;
    if (rows.length === 0 || !rows[0].manifest_key) {
      throw new NotFoundException("Chua co revision san sang de xem truoc.");
    }
    return rows[0];
  }

  /** Anh trang/thumbnail cho dashboard cua chinh Creator (khac /public/books/.../assets). */
  @Get(":id/assets/:assetId")
  async getAsset(
    @Req() req: AuthedRequest,
    @Param("id") bookId: string,
    @Param("assetId") assetId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const { rows } = await req.dbClient.query(
      `SELECT object_key, content_type FROM assets
       WHERE id = $1 AND book_id = $2 AND kind IN ('page_image','thumbnail')`,
      [assetId, bookId]
    );
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay anh.");
    }
    res.setHeader("Content-Type", rows[0].content_type);
    res.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(this.storage.createReadStream(rows[0].object_key));
  }

  @Post(":id/publish")
  async publish(@Req() req: AuthedRequest, @Param("id") bookId: string, @Body() dto: PublishBookDto) {
    const revRes = await req.dbClient.query(
      `SELECT id, state FROM revisions WHERE id = $1 AND book_id = $2`,
      [dto.revisionId, bookId]
    );
    if (revRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay revision cua sach nay.");
    }
    if (revRes.rows[0].state !== "ready") {
      throw new BadRequestException(
        `Revision dang o trang thai '${revRes.rows[0].state}', chi publish duoc revision 'ready'.`
      );
    }
    // published_at: CHI dat lan dau tien (COALESCE) - endpoint nay cung duoc goi lai khi
    // republish/rollback sang revision khac, khong duoc lam mat "ngay dang" ban dau.
    const updateRes = await req.dbClient.query(
      `UPDATE books SET status = 'published', published_revision_id = $1, published_at = COALESCE(published_at, now())
       WHERE id = $2 RETURNING id`,
      [dto.revisionId, bookId]
    );
    if (updateRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    return this.getOne(req, bookId);
  }

  /** F12: luot mo/luot xem trang THEO NGAY (khac tong 30 ngay o BOOK_SELECT_COLUMNS,
   * dung de ve bang/bieu do chi tiet). RLS (daily_stats_owner_all) da tu gioi han dung
   * sach cua chinh Creator nay - khong can WHERE book_id o day cung an toan, nhung viet
   * ro cho de doc va tranh quet nham sach khac neu RLS bi tat nham trong tuong lai. */
  @Get(":id/stats")
  async getDailyStats(@Req() req: AuthedRequest, @Param("id") bookId: string, @Query("days") daysQuery?: string) {
    const bookRes = await req.dbClient.query(`SELECT id FROM books WHERE id = $1`, [bookId]);
    if (bookRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    const days = Math.min(90, Math.max(1, Number(daysQuery) || 30));
    const { rows } = await req.dbClient.query(
      `SELECT stat_date, opens, page_views FROM daily_stats
       WHERE book_id = $1 AND stat_date >= CURRENT_DATE - ($2 || ' days')::interval
       ORDER BY stat_date ASC`,
      [bookId, days]
    );
    return rows;
  }

  @Get(":id/settings")
  async getSettings(@Req() req: AuthedRequest, @Param("id") bookId: string) {
    const bookRes = await req.dbClient.query(`SELECT id FROM books WHERE id = $1`, [bookId]);
    if (bookRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    const { rows } = await req.dbClient.query(
      `SELECT allow_download, thumbnail_asset_id, ga_id, (password_hash IS NOT NULL) AS has_password, visibility,
              (background_object_key IS NOT NULL) AS has_background
       FROM book_settings WHERE book_id = $1`,
      [bookId]
    );
    return (
      rows[0] ?? {
        allow_download: false,
        thumbnail_asset_id: null,
        ga_id: null,
        has_password: false,
        visibility: "public",
        has_background: false,
      }
    );
  }

  /** F15: anh nen backdrop cho khung doc (khac han anh trang/thumbnail cua PDF). */
  @Post(":id/background")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: BACKGROUND_MAX_BYTES } }))
  async uploadBackground(
    @Req() req: AuthedRequest,
    @Param("id") bookId: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("Thieu file anh (field 'file').");
    }
    if (file.size > BACKGROUND_MAX_BYTES) {
      throw new BadRequestException(`Anh vuot qua gioi han ${BACKGROUND_MAX_BYTES} bytes.`);
    }
    const signature = BACKGROUND_SIGNATURES.find((s) => s.check(file.buffer));
    if (!signature) {
      throw new BadRequestException("Anh nen chi ho tro PNG, JPEG hoac WebP.");
    }

    const bookRes = await req.dbClient.query("SELECT id FROM books WHERE id = $1", [bookId]);
    if (bookRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }

    // Ten co dinh (khong theo revision) - moi lan upload GHI DE anh cu, dung 1 anh/sach.
    const objectKey = `${req.tenantId}/${bookId}/background/original`;
    await this.storage.saveBuffer(objectKey, file.buffer);

    const { rows } = await req.dbClient.query(
      `INSERT INTO book_settings (tenant_id, book_id, background_object_key, background_content_type)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (book_id) DO UPDATE SET
         background_object_key = $3,
         background_content_type = $4
       RETURNING allow_download, thumbnail_asset_id, ga_id, (password_hash IS NOT NULL) AS has_password, visibility,
                 (background_object_key IS NOT NULL) AS has_background`,
      [req.tenantId, bookId, objectKey, signature.contentType]
    );
    return rows[0];
  }

  @Get(":id/background")
  async getBackground(@Req() req: AuthedRequest, @Param("id") bookId: string, @Res({ passthrough: true }) res: Response) {
    const { rows } = await req.dbClient.query(
      `SELECT bs.background_object_key, bs.background_content_type
       FROM books b JOIN book_settings bs ON bs.book_id = b.id
       WHERE b.id = $1`,
      [bookId]
    );
    if (rows.length === 0 || !rows[0].background_object_key) {
      throw new NotFoundException("Sach nay chua co anh nen.");
    }
    res.setHeader("Content-Type", rows[0].background_content_type);
    res.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(this.storage.createReadStream(rows[0].background_object_key));
  }

  @Delete(":id/background")
  async removeBackground(@Req() req: AuthedRequest, @Param("id") bookId: string) {
    const bookRes = await req.dbClient.query("SELECT id FROM books WHERE id = $1", [bookId]);
    if (bookRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    const { rows } = await req.dbClient.query(
      `UPDATE book_settings SET background_object_key = NULL, background_content_type = NULL
       WHERE book_id = $1
       RETURNING allow_download, thumbnail_asset_id, ga_id, (password_hash IS NOT NULL) AS has_password, visibility,
                 (background_object_key IS NOT NULL) AS has_background`,
      [bookId]
    );
    return (
      rows[0] ?? {
        allow_download: false,
        thumbnail_asset_id: null,
        ga_id: null,
        has_password: false,
        visibility: "public",
        has_background: false,
      }
    );
  }

  @Put(":id/settings")
  async putSettings(
    @Req() req: AuthedRequest,
    @Param("id") bookId: string,
    @Body() dto: UpdateBookSettingsDto
  ) {
    const bookRes = await req.dbClient.query(`SELECT id FROM books WHERE id = $1`, [bookId]);
    if (bookRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    if (dto.thumbnailAssetId) {
      const assetRes = await req.dbClient.query(
        `SELECT id FROM assets WHERE id = $1 AND book_id = $2 AND kind = 'thumbnail'`,
        [dto.thumbnailAssetId, bookId]
      );
      if (assetRes.rowCount === 0) {
        throw new BadRequestException("thumbnailAssetId khong hop le hoac khong thuoc sach nay.");
      }
    }
    // removePassword uu tien hon password neu ca 2 cung gui (tranh vua xoa vua dat mot
    // luc mot cach mo ho). Chi hash khi thuc su co password moi - khong hash chuoi rong.
    const removePassword = dto.removePassword === true;
    const newPasswordHash = !removePassword && dto.password ? await argon2.hash(dto.password) : null;
    // access_epoch tang moi khi mat khau doi/xoa - vo hieu hoa ngay moi access token da
    // phat qua verify-password truoc do (F05: doi mat khau phai buoc nguoi xem nhap lai).
    const bumpEpoch = removePassword || newPasswordHash !== null;
    // F06: gaId phan biet 3 trang thai (khong the dung COALESCE nhu cac field khac vi
    // "gui null" phai XOA duoc gia tri, khac voi "khong gui field" = giu nguyen). PHAI
    // kiem tra tren req.body THO (JSON goc), KHONG tren instance `dto`: voi target ES2022,
    // khai bao field class (vd "gaId?: string") tu dong tao own-property `undefined` cho
    // MOI instance bat ke client co gui hay khong - hasOwnProperty(dto, "gaId") luon true,
    // se xoa nham gia tri cu (da phat hien qua test that, khong phai doan truoc).
    const gaIdProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, "gaId");
    const gaIdValue = gaIdProvided ? dto.gaId ?? null : null;
    const { rows } = await req.dbClient.query(
      `INSERT INTO book_settings (tenant_id, book_id, allow_download, thumbnail_asset_id, password_hash, access_epoch, visibility, ga_id)
       VALUES ($1,$2, COALESCE($3, false), $4, $5, CASE WHEN $6 THEN 1 ELSE 0 END, COALESCE($8, 'public'), $9)
       ON CONFLICT (book_id) DO UPDATE SET
         allow_download = COALESCE($3, book_settings.allow_download),
         thumbnail_asset_id = COALESCE($4, book_settings.thumbnail_asset_id),
         password_hash = CASE
           WHEN $7::boolean THEN NULL
           WHEN $5::text IS NOT NULL THEN $5
           ELSE book_settings.password_hash
         END,
         access_epoch = CASE WHEN $6::boolean THEN book_settings.access_epoch + 1 ELSE book_settings.access_epoch END,
         failed_attempts = CASE WHEN $6::boolean THEN 0 ELSE book_settings.failed_attempts END,
         locked_until = CASE WHEN $6::boolean THEN NULL ELSE book_settings.locked_until END,
         visibility = COALESCE($8, book_settings.visibility),
         ga_id = CASE WHEN $10::boolean THEN $9 ELSE book_settings.ga_id END
       RETURNING allow_download, thumbnail_asset_id, ga_id, (password_hash IS NOT NULL) AS has_password, visibility,
                 (background_object_key IS NOT NULL) AS has_background`,
      [
        req.tenantId,
        bookId,
        dto.allowDownload ?? null,
        dto.thumbnailAssetId ?? null,
        newPasswordHash,
        bumpEpoch,
        removePassword,
        dto.visibility ?? null,
        gaIdValue,
        gaIdProvided,
      ]
    );
    // SEC-03: doi/xoa mat khau phai "xoa het khoa cu" cho MOI dia chi tung bi khoa tren
    // sach nay - khong lam vay thi chinh chu so huu se tu khoa minh khoi sach cua ho
    // (khoa cu theo IP con hieu luc toi 15 phut du mat khau da doi, phat hien qua
    // p3_e2e.test.js chay that). Giu nguyen ky vong cu cua book_settings.failed_attempts/
    // locked_until (reset ve 0 moi khi access_epoch tang, xem CASE WHEN $6 o tren).
    if (bumpEpoch) {
      await this.rateLimit.resetByPrefix(`bookpw:${bookId}:`);
    }
    return rows[0];
  }
}
