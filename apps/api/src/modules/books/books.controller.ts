import * as crypto from "crypto";
import {
  BadRequestException,
  Body,
  Controller,
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

const PDF_SIGNATURE = Buffer.from("%PDF-");
const PDF_MAX_BYTES = Number(process.env.PDF_MAX_BYTES ?? 200 * 1024 * 1024);
const PIPELINE_VERSION = process.env.PDF_PIPELINE_VERSION ?? "v1";
const MAX_SLUG_RETRIES = 5;

// coverAssetId: uu tien thumbnail Creator tu chon (book_settings.thumbnail_asset_id),
// khong thi lay thumbnail trang dau cua revision DANG PUBLISH (chua publish thi
// chua co anh bia cong khai - dashboard hien placeholder, tranh lo anh cua revision
// chua duyet ra ngoai qua duong public asset).
const BOOK_SELECT_COLUMNS = `
  b.id, b.title, b.permalink_slug, b.permalink_suffix, b.status, b.published_revision_id,
  b.created_at, b.updated_at,
  COALESCE(
    bs.thumbnail_asset_id,
    (SELECT a.id FROM assets a
     WHERE a.book_id = b.id AND a.revision_id = b.published_revision_id AND a.kind = 'thumbnail'
     ORDER BY a.object_key LIMIT 1)
  ) AS cover_asset_id
`;

@Controller("books")
@UseGuards(JwtAuthGuard)
@UseInterceptors(DbContextInterceptor)
@RequireTenant()
export class BooksController {
  constructor(@Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter) {}

  @Get()
  async list(@Req() req: AuthedRequest) {
    // RLS (books_owner_read) da gioi han chi sach cua chinh nguoi goi trong tenant nay.
    const { rows } = await req.dbClient.query(
      `SELECT ${BOOK_SELECT_COLUMNS} FROM books b
       LEFT JOIN book_settings bs ON bs.book_id = b.id
       ORDER BY b.created_at DESC`
    );
    return rows;
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateBookDto) {
    const baseSlug = slugifyVietnamese(dto.title);
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      const suffix = randomSuffix8();
      try {
        const { rows } = await req.dbClient.query(
          `INSERT INTO books (tenant_id, owner_id, title, permalink_slug, permalink_suffix)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id, title, permalink_slug, permalink_suffix, status, created_at`,
          [req.tenantId, req.userId, dto.title, baseSlug, suffix]
        );
        return rows[0];
      } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr.code === "23505") {
          // Trung (slug, suffix) - F02 yeu cau retry khi trung, khong loi ra nguoi dung.
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException(
      `Khong tao duoc permalink duy nhat sau ${MAX_SLUG_RETRIES} lan thu.`
    );
    // eslint-disable-next-line no-unreachable
    void lastError;
  }

  @Get(":id")
  async getOne(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { rows } = await req.dbClient.query(
      `SELECT ${BOOK_SELECT_COLUMNS} FROM books b
       LEFT JOIN book_settings bs ON bs.book_id = b.id
       WHERE b.id = $1`,
      [id]
    );
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    return rows[0];
  }

  @Post(":id/upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: PDF_MAX_BYTES } }))
  async upload(
    @Req() req: AuthedRequest,
    @Param("id") bookId: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("Thieu file PDF (field 'file').");
    }
    if (file.buffer.subarray(0, 5).compare(PDF_SIGNATURE) !== 0) {
      throw new BadRequestException("File khong dung dinh dang PDF (sai chu ky %PDF-).");
    }
    if (file.size > PDF_MAX_BYTES) {
      throw new BadRequestException(`File vuot qua gioi han ${PDF_MAX_BYTES} bytes.`);
    }

    const bookRes = await req.dbClient.query("SELECT id FROM books WHERE id = $1", [bookId]);
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
    const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const objectKey = `${req.tenantId}/${bookId}/${revisionId}/source.pdf`;

    await this.storage.saveBuffer(objectKey, file.buffer);

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
    const updateRes = await req.dbClient.query(
      `UPDATE books SET status = 'published', published_revision_id = $1 WHERE id = $2 RETURNING id`,
      [dto.revisionId, bookId]
    );
    if (updateRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    return this.getOne(req, bookId);
  }

  @Get(":id/settings")
  async getSettings(@Req() req: AuthedRequest, @Param("id") bookId: string) {
    const bookRes = await req.dbClient.query(`SELECT id FROM books WHERE id = $1`, [bookId]);
    if (bookRes.rowCount === 0) {
      throw new NotFoundException("Khong tim thay sach.");
    }
    const { rows } = await req.dbClient.query(
      `SELECT allow_download, thumbnail_asset_id, ga_id, (password_hash IS NOT NULL) AS has_password
       FROM book_settings WHERE book_id = $1`,
      [bookId]
    );
    return rows[0] ?? { allow_download: false, thumbnail_asset_id: null, ga_id: null, has_password: false };
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
    const { rows } = await req.dbClient.query(
      `INSERT INTO book_settings (tenant_id, book_id, allow_download, thumbnail_asset_id)
       VALUES ($1,$2, COALESCE($3, false), $4)
       ON CONFLICT (book_id) DO UPDATE SET
         allow_download = COALESCE($3, book_settings.allow_download),
         thumbnail_asset_id = COALESCE($4, book_settings.thumbnail_asset_id)
       RETURNING allow_download, thumbnail_asset_id, ga_id, (password_hash IS NOT NULL) AS has_password`,
      [req.tenantId, bookId, dto.allowDownload ?? null, dto.thumbnailAssetId ?? null]
    );
    return rows[0];
  }
}
