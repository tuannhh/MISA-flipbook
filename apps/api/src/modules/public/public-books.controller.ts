import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { JwtService } from "@nestjs/jwt";
import type { Request, Response } from "express";
import { Pool } from "pg";
import { DB_POOL } from "../../common/db/db.tokens";
import { rateLimitKeyPart, RateLimitService } from "../../common/rate-limit/rate-limit.service";
import { STORAGE_ADAPTER, StorageAdapter } from "../../storage/storage.interface";
import { buildReaderPages } from "../books/util/build-reader-pages";
import { RecordBookEventDto } from "./dto/record-book-event.dto";
import { VerifyBookPasswordDto } from "./dto/verify-book-password.dto";
import { DASHBOARD_SESSION_COOKIE, readCookie } from "../../common/auth/session-cookie";

const BOOK_ACCESS_TOKEN_TYP = "book_access";
const BOOK_ACCESS_TOKEN_TTL_SECONDS = Number(process.env.BOOK_ACCESS_TOKEN_TTL_SECONDS ?? 4 * 60 * 60);
const OWNER_READER_TOKEN_TTL_SECONDS = Number(process.env.OWNER_READER_TOKEN_TTL_SECONDS ?? 10 * 60);
const PASSWORD_MAX_ATTEMPTS = Number(process.env.BOOK_PASSWORD_MAX_ATTEMPTS ?? 8);
const PASSWORD_IP_MAX_ATTEMPTS = Number(process.env.BOOK_PASSWORD_IP_MAX_ATTEMPTS ?? 32);
const PASSWORD_LOCK_MINUTES = Number(process.env.BOOK_PASSWORD_LOCKOUT_MINUTES ?? 15);

type ReaderScope = "public" | "password" | "owner";

interface PublicBookRow {
  book_id: string;
  tenant_id: string;
  owner_id: string;
  title: string;
  permalink_slug: string;
  permalink_suffix: string;
  allow_download: boolean;
  has_password: boolean;
  password_hash: string | null;
  access_epoch: number;
  published_revision_id: string;
  manifest_key: string;
  visibility: "public" | "private";
  background_object_key: string | null;
  background_content_type: string | null;
  ga_id: string | null;
  default_ga_id: string | null;
}

interface BookAccessTokenPayload {
  typ: typeof BOOK_ACCESS_TOKEN_TYP;
  bookId: string;
  revisionId: string;
  accessEpoch: number;
  scope: ReaderScope;
  sessionId: string;
  actorUserId?: string;
}

interface LoginTokenPayload {
  sub: string;
  email: string;
  typ?: undefined;
}

interface Actor {
  userId: string;
  isAdmin: boolean;
}

interface ReadGrant {
  book: PublicBookRow;
  revisionId: string;
  manifestKey: string;
  readerToken: string;
  sessionId: string;
}

/**
 * Public reader endpoints intentionally do not run DbContextInterceptor. Every
 * database access therefore uses a narrowly scoped SECURITY DEFINER function. The
 * reader JWT is never a dashboard JWT: it can read one book/revision only, has a
 * short expiry, carries an access epoch, and cannot authenticate any admin route.
 */
@Controller("public/books")
export class PublicBooksController {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly jwtService: JwtService,
    private readonly rateLimit: RateLimitService
  ) {}

  private parsePermalink(permalink: string): { slug: string; suffix: string } {
    const lastDash = permalink.lastIndexOf("-");
    if (lastDash < 1 || permalink.length - lastDash - 1 !== 8) {
      throw new NotFoundException("Link khong hop le.");
    }
    return { slug: permalink.slice(0, lastDash), suffix: permalink.slice(lastDash + 1) };
  }

  private extractToken(req: Request, queryToken?: string): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
    // Query tokens are scoped reader grants, therefore they take precedence over
    // a Dashboard cookie when a password reader also happens to be logged in.
    return queryToken || readCookie(req, DASHBOARD_SESSION_COOKIE);
  }

  private async findPublishedBook(permalink: string): Promise<PublicBookRow> {
    const { slug, suffix } = this.parsePermalink(permalink);
    const { rows } = await this.pool.query<PublicBookRow>("SELECT * FROM public_get_book($1,$2)", [slug, suffix]);
    if (!rows[0]) throw new NotFoundException("Khong tim thay sach, hoac sach chua duoc publish.");
    return rows[0];
  }

  private async getReadyRevision(book: PublicBookRow, revisionId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ manifest_key: string }>("SELECT * FROM public_get_ready_revision($1,$2)", [
      book.book_id,
      revisionId,
    ]);
    return rows[0]?.manifest_key ?? null;
  }

  private async resolveActor(token: string | undefined): Promise<Actor | null> {
    if (!token) return null;
    let payload: LoginTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<LoginTokenPayload>(token);
    } catch {
      return null;
    }
    if (!payload.sub || payload.typ) return null;
    return this.resolveActorById(payload.sub);
  }

  private async resolveActorById(userId: string): Promise<Actor | null> {
    const { rows } = await this.pool.query<{ is_system_admin: boolean; status: string }>(
      "SELECT is_system_admin, status FROM auth_lookup_user_by_id($1)",
      [userId]
    );
    if (!rows[0] || rows[0].status !== "active") return null;
    return { userId, isAdmin: rows[0].is_system_admin };
  }

  private async isActiveOwner(actor: Actor | null, book: PublicBookRow): Promise<boolean> {
    if (!actor || actor.userId !== book.owner_id) return false;
    const { rows } = await this.pool.query<{ status: string | null }>(
      "SELECT public_lookup_membership_status($1,$2) AS status",
      [book.tenant_id, actor.userId]
    );
    return rows[0]?.status === "active";
  }

  private isProtectedBook(book: PublicBookRow): boolean {
    return book.visibility === "private" || !!book.password_hash;
  }

  private setResponseHeaders(res: Response, book: PublicBookRow): void {
    // Prevent stale public data surviving a public -> password/private change.
    // Existing CDN/browser entries from before this release must be purged on deploy.
    res.setHeader("Cache-Control", this.isProtectedBook(book) ? "private, no-store" : "public, max-age=0, must-revalidate");
    res.setHeader("Vary", "Authorization");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  }

  private parseSingleByteRange(value: string | undefined, size: number): { start: number; end: number } | "invalid" | null {
    if (!value) return null;
    if (!value.startsWith("bytes=") || value.includes(",") || size < 1) return "invalid";
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || (!match[1] && !match[2])) return "invalid";
    const [, startText, endText] = match;
    if (!startText) {
      const suffixLength = Number(endText);
      if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return "invalid";
      return { start: Math.max(0, size - suffixLength), end: size - 1 };
    }
    const start = Number(startText);
    const requestedEnd = endText ? Number(endText) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
      return "invalid";
    }
    return { start, end: Math.min(requestedEnd, size - 1) };
  }

  private async streamWithRange(
    req: Request,
    res: Response,
    objectKey: string,
    contentType: string
  ): Promise<StreamableFile | { statusCode: number; message: string }> {
    const size = await this.storage.getSize(objectKey);
    const range = this.parseSingleByteRange(req.headers.range, size);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);
    if (range === "invalid") {
      res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
      res.setHeader("Content-Range", `bytes */${size}`);
      return { statusCode: HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, message: "Byte range khong hop le." };
    }
    if (range) {
      const length = range.end - range.start + 1;
      res.status(HttpStatus.PARTIAL_CONTENT);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      res.setHeader("Content-Length", String(length));
      return new StreamableFile(this.storage.createReadStream(objectKey, { start: range.start, end: range.end }));
    }
    res.setHeader("Content-Length", String(size));
    return new StreamableFile(this.storage.createReadStream(objectKey));
  }

  private async issueReadGrant(book: PublicBookRow, scope: ReaderScope, actorUserId?: string): Promise<ReadGrant> {
    const revisionId = book.published_revision_id;
    const manifestKey = await this.getReadyRevision(book, revisionId);
    if (!manifestKey) throw new NotFoundException("Revision da publish khong con san sang.");
    const sessionId = randomUUID();
    const expiresIn = scope === "owner" ? OWNER_READER_TOKEN_TTL_SECONDS : BOOK_ACCESS_TOKEN_TTL_SECONDS;
    const readerToken = await this.jwtService.signAsync(
      {
        typ: BOOK_ACCESS_TOKEN_TYP,
        bookId: book.book_id,
        revisionId,
        accessEpoch: book.access_epoch,
        scope,
        sessionId,
        ...(scope === "owner" ? { actorUserId } : {}),
      } satisfies BookAccessTokenPayload,
      { expiresIn }
    );
    return { book, revisionId, manifestKey, readerToken, sessionId };
  }

  /** Validate a scoped reader token, including immediate membership revocation. */
  private async getReadGrantFromToken(book: PublicBookRow, token: string | undefined): Promise<ReadGrant | null> {
    if (!token) return null;
    let payload: BookAccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<BookAccessTokenPayload>(token);
    } catch {
      return null;
    }
    if (
      payload.typ !== BOOK_ACCESS_TOKEN_TYP ||
      payload.bookId !== book.book_id ||
      payload.accessEpoch !== book.access_epoch ||
      !["public", "password", "owner"].includes(payload.scope) ||
      !payload.revisionId ||
      !payload.sessionId
    ) {
      return null;
    }
    if (payload.scope === "public" && this.isProtectedBook(book)) return null;
    if (payload.scope === "password" && (book.visibility !== "public" || !book.password_hash)) return null;
    if (payload.scope === "owner") {
      if (!payload.actorUserId) return null;
      const actor = await this.resolveActorById(payload.actorUserId);
      if (!actor || (!actor.isAdmin && !(await this.isActiveOwner(actor, book)))) return null;
    }
    const manifestKey = await this.getReadyRevision(book, payload.revisionId);
    if (!manifestKey) return null;
    return { book, revisionId: payload.revisionId, manifestKey, readerToken: token, sessionId: payload.sessionId };
  }

  /**
   * A dashboard JWT is accepted only once to prove owner/admin access, then exchanged
   * for a least-privilege reader token. It is never used in asset/download URLs.
   */
  private async getAuthorizedRead(permalink: string, token: string | undefined): Promise<ReadGrant> {
    const book = await this.findPublishedBook(permalink);
    const existing = await this.getReadGrantFromToken(book, token);
    if (existing) return existing;

    const actor = await this.resolveActor(token);
    const isOwner = await this.isActiveOwner(actor, book);
    const canManage = !!actor && (actor.isAdmin || isOwner);

    if (book.visibility === "private") {
      if (!canManage) {
        throw new ForbiddenException({
          statusCode: 403,
          privateBook: true,
          message: "Sach nay dang o che do rieng tu, chi chu so huu moi xem duoc.",
        });
      }
      if (actor!.isAdmin && !isOwner) {
        await this.pool.query("SELECT public_record_admin_private_view($1,$2,$3)", [actor!.userId, book.tenant_id, book.book_id]);
      }
      return this.issueReadGrant(book, "owner", actor!.userId);
    }

    if (book.password_hash) {
      if (!canManage) {
        throw new ForbiddenException({
          statusCode: 403,
          passwordRequired: true,
          message: "Sach nay yeu cau mat khau de xem.",
        });
      }
      return this.issueReadGrant(book, "owner", actor!.userId);
    }
    return this.issueReadGrant(book, "public");
  }

  @Get(":permalink/metadata")
  async getMetadata(@Param("permalink") permalink: string, @Res({ passthrough: true }) res: Response) {
    const book = await this.findPublishedBook(permalink);
    this.setResponseHeaders(res, book);
    if (this.isProtectedBook(book)) return { title: "MISA Flipbook", hasPreviewImage: false };
    const custom = await this.pool.query("SELECT * FROM public_get_share_thumbnail($1)", [book.book_id]);
    const fallback = await this.pool.query("SELECT id FROM public_list_revision_page_assets($1,$2) WHERE kind = 'thumbnail' LIMIT 1", [
      book.book_id,
      book.published_revision_id,
    ]);
    return { title: book.title, hasPreviewImage: custom.rowCount! > 0 || fallback.rowCount! > 0 };
  }

  @Get(":permalink/preview-image")
  async getPreviewImage(@Param("permalink") permalink: string, @Res({ passthrough: true }) res: Response) {
    const book = await this.findPublishedBook(permalink);
    if (this.isProtectedBook(book)) throw new NotFoundException("Khong co anh xem truoc.");
    const custom = await this.pool.query<{ object_key: string; content_type: string }>("SELECT * FROM public_get_share_thumbnail($1)", [book.book_id]);
    const fallback = custom.rows[0]
      ? custom.rows
      : (await this.pool.query<{ object_key: string; content_type: string }>(
          "SELECT object_key, content_type FROM public_list_revision_page_assets($1,$2) WHERE kind = 'thumbnail' LIMIT 1",
          [book.book_id, book.published_revision_id]
        )).rows;
    if (!fallback[0]) throw new NotFoundException("Khong co anh xem truoc.");
    res.setHeader("Content-Type", fallback[0].content_type);
    this.setResponseHeaders(res, book);
    return new StreamableFile(this.storage.createReadStream(fallback[0].object_key));
  }

  @Get(":permalink")
  async getBook(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") tokenQuery?: string
  ) {
    const grant = await this.getAuthorizedRead(permalink, this.extractToken(req, tokenQuery));
    this.setResponseHeaders(res, grant.book);
    const manifest = JSON.parse((await this.storage.readBuffer(grant.manifestKey)).toString("utf8"));
    const assetsRes = await this.pool.query("SELECT * FROM public_list_revision_page_assets($1,$2)", [grant.book.book_id, grant.revisionId]);
    return {
      title: grant.book.title,
      permalink: `${grant.book.permalink_slug}-${grant.book.permalink_suffix}`,
      allowDownload: grant.book.allow_download,
      hasBackground: !!grant.book.background_object_key,
      gaId: grant.book.ga_id ?? grant.book.default_ga_id ?? null,
      readerToken: grant.readerToken,
      pages: buildReaderPages(manifest, assetsRes.rows),
    };
  }

  @Get(":permalink/background")
  async getBackground(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") tokenQuery?: string
  ) {
    const grant = await this.getAuthorizedRead(permalink, this.extractToken(req, tokenQuery));
    if (!grant.book.background_object_key) throw new NotFoundException("Sach nay khong co anh nen.");
    res.setHeader("Content-Type", grant.book.background_content_type ?? "application/octet-stream");
    this.setResponseHeaders(res, grant.book);
    return new StreamableFile(this.storage.createReadStream(grant.book.background_object_key));
  }

  @Get(":permalink/assets/:assetId")
  async getAsset(
    @Param("permalink") permalink: string,
    @Param("assetId") assetId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") tokenQuery?: string
  ) {
    const grant = await this.getAuthorizedRead(permalink, this.extractToken(req, tokenQuery));
    const { rows } = await this.pool.query<{ object_key: string; content_type: string }>("SELECT * FROM public_get_revision_page_asset($1,$2,$3)", [
      grant.book.book_id,
      grant.revisionId,
      assetId,
    ]);
    if (!rows[0]) throw new NotFoundException("Khong tim thay tai nguyen cua sach.");
    this.setResponseHeaders(res, grant.book);
    return this.streamWithRange(req, res, rows[0].object_key, rows[0].content_type);
  }

  @Get(":permalink/download")
  async download(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") tokenQuery?: string
  ) {
    const grant = await this.getAuthorizedRead(permalink, this.extractToken(req, tokenQuery));
    if (!grant.book.allow_download) throw new ForbiddenException("Sach nay khong cho phep tai xuong PDF goc.");
    const { rows } = await this.pool.query<{ object_key: string; content_type: string; file_name_hint: string }>("SELECT * FROM public_get_revision_source_pdf($1,$2)", [
      grant.book.book_id,
      grant.revisionId,
    ]);
    if (!rows[0]) throw new ForbiddenException("Sach nay khong cho phep tai xuong PDF goc.");
    res.setHeader("Content-Disposition", `attachment; filename="${rows[0].file_name_hint}"`);
    this.setResponseHeaders(res, grant.book);
    return this.streamWithRange(req, res, rows[0].object_key, "application/pdf");
  }

  @Post(":permalink/events")
  async recordReaderEvent(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Body() dto: RecordBookEventDto,
    @Query("token") tokenQuery?: string
  ) {
    const book = await this.findPublishedBook(permalink);
    const grant = await this.getReadGrantFromToken(book, this.extractToken(req, tokenQuery));
    if (!grant) throw new ForbiddenException("Phien doc khong hop le hoac da het han.");
    const pageNumber = dto.eventType === "open" ? 0 : dto.page!;
    const { rows } = await this.pool.query<{ public_record_reader_event: boolean }>("SELECT public_record_reader_event($1,$2,$3,$4,$5,$6)", [
      grant.book.book_id,
      grant.book.tenant_id,
      grant.revisionId,
      grant.sessionId,
      dto.eventType,
      pageNumber,
    ]);
    return { ok: true, counted: rows[0]?.public_record_reader_event ?? false };
  }

  @Post(":permalink/verify-password")
  async verifyPassword(@Param("permalink") permalink: string, @Body() dto: VerifyBookPasswordDto, @Req() req: Request) {
    const book = await this.findPublishedBook(permalink);
    if (book.visibility === "private" || !book.password_hash) throw new BadRequestException("Sach nay khong nhan mat khau o che do hien tai.");
    const windowSeconds = PASSWORD_LOCK_MINUTES * 60;
    const sourceKey = `bookpw-ip:${rateLimitKeyPart(`book-password-source:${req.ip}`)}`;
    const bookKey = `bookpw:${book.book_id}:${rateLimitKeyPart(`book-password:${req.ip}`)}`;
    // A book/IP cap avoids one reader locking everyone out. The source cap also
    // stops a single client spraying a password over many public books.
    const sourceResult = await this.rateLimit.consume(sourceKey, PASSWORD_IP_MAX_ATTEMPTS, windowSeconds);
    if (!sourceResult.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Da co qua nhieu lan thu mat khau tu ket noi nay. Thu lai sau khoang ${Math.ceil(sourceResult.retryAfterSeconds / 60)} phut.`,
          retryAfterSeconds: sourceResult.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    const bookResult = await this.rateLimit.consume(bookKey, PASSWORD_MAX_ATTEMPTS, windowSeconds);
    if (!bookResult.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Da nhap sai qua nhieu lan. Thu lai sau khoang ${Math.ceil(bookResult.retryAfterSeconds / 60)} phut.`,
          retryAfterSeconds: bookResult.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    const ok = await argon2.verify(book.password_hash, dto.password).catch(() => false);
    await this.pool.query("SELECT public_record_password_attempt($1,$2,$3,$4)", [book.book_id, ok, PASSWORD_MAX_ATTEMPTS, PASSWORD_LOCK_MINUTES]).catch(() => undefined);
    if (!ok) throw new UnauthorizedException(`Sai mat khau. Con toi da ${bookResult.remaining} lan thu tu dia chi nay.`);
    await Promise.all([this.rateLimit.reset(bookKey), this.rateLimit.reset(sourceKey)]);
    const grant = await this.issueReadGrant(book, "password");
    return { readerToken: grant.readerToken, expiresIn: BOOK_ACCESS_TOKEN_TTL_SECONDS };
  }
}
