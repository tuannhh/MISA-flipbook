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
import { JwtService } from "@nestjs/jwt";
import type { Request, Response } from "express";
import { Pool } from "pg";
import { DB_POOL } from "../../common/db/db.tokens";
import { STORAGE_ADAPTER, StorageAdapter } from "../../storage/storage.interface";
import { buildReaderPages } from "../books/util/build-reader-pages";
import { VerifyBookPasswordDto } from "./dto/verify-book-password.dto";
import { RecordBookEventDto } from "./dto/record-book-event.dto";
import { RateLimitService } from "../../common/rate-limit/rate-limit.service";

const BOOK_ACCESS_TOKEN_TYP = "book_access";
const BOOK_ACCESS_TOKEN_TTL_SECONDS = Number(process.env.BOOK_ACCESS_TOKEN_TTL_SECONDS ?? 12 * 60 * 60);
const PASSWORD_MAX_ATTEMPTS = Number(process.env.BOOK_PASSWORD_MAX_ATTEMPTS ?? 8);
const PASSWORD_LOCK_MINUTES = Number(process.env.BOOK_PASSWORD_LOCKOUT_MINUTES ?? 15);

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
  failed_attempts: number;
  locked_until: string | null;
  published_revision_id: string;
  manifest_key: string;
  visibility: "public" | "private";
  background_object_key: string | null;
  background_content_type: string | null;
  ga_id: string | null;
  default_ga_id: string | null;
}

interface BookAccessTokenPayload {
  typ: string;
  bookId: string;
  accessEpoch: number;
}

// JWT dang nhap Creator/Admin thuong (xem apps/api/src/common/auth/jwt-payload.interface.ts)
// - KHONG co claim `typ`, khac han BookAccessTokenPayload. Route nay khong dung
// DbContextInterceptor nen tu xac minh + tra cuu rieng qua auth_lookup_user_by_id.
interface LoginTokenPayload {
  sub: string;
  email: string;
  typ?: undefined;
}

interface Actor {
  userId: string;
  isAdmin: boolean;
}

/**
 * Doc sach cong khai (khong dang nhap) - KHONG dung DbContextInterceptor (doi hoi JWT
 * dang nhap Creator/Admin). Moi truy van di qua ham SECURITY DEFINER trong
 * infra/migrations/0006_public_reader.sql + 0007_book_password_protection.sql, tu
 * gioi han chi tra ve du lieu cua sach da publish va khong bao gio lo source_pdf
 * (tru dung endpoint /download khi allow_download=true, kiem tra ca 2 tang).
 *
 * F05 (mat khau xem): sach co password_hash bi chan (403, kem { passwordRequired: true }
 * de FE phan biet voi 403/404 thuong) tru khi kem mot "book access token" hop le - JWT
 * rieng (khac JWT dang nhap Nguoi tao/Admin, phan biet bang claim typ='book_access')
 * cap qua POST .../verify-password sau khi nhap dung mat khau. Token nhung ca
 * access_epoch tai thoi diem cap; doi/xoa mat khau lam epoch tang len -> token cu tu
 * dong het hieu luc ma khong can blacklist rieng.
 *
 * F16 (Publish/Private tren sach da publish): cung slot Bearer token/`?token=` co the
 * mang JWT DANG NHAP thuong (Creator/Admin, khong co claim `typ`) thay vi book access
 * token - dung de sach Private van xem duoc qua CHINH permalink cu neu la owner hoac
 * system admin. Private la lop chan CAO HON F05: khi visibility='private', bo qua
 * hoan toan kiem tra mat khau (khong cong don 2 lop, da chot voi nguoi dung), chi con
 * owner/admin duoc vao; Admin xem sach Private khong phai cua minh BAT BUOC ghi
 * audit_logs (khong ngoai le).
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
    if (lastDash < 0 || permalink.length - lastDash - 1 !== 8) {
      throw new NotFoundException("Link khong hop le.");
    }
    return { slug: permalink.slice(0, lastDash), suffix: permalink.slice(lastDash + 1) };
  }

  private extractToken(req: Request, queryToken?: string): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      return header.slice("Bearer ".length);
    }
    return queryToken || undefined;
  }

  private async hasValidAccessToken(token: string | undefined, book: PublicBookRow): Promise<boolean> {
    if (!token) return false;
    try {
      const payload = await this.jwtService.verifyAsync<BookAccessTokenPayload>(token);
      return payload.typ === BOOK_ACCESS_TOKEN_TYP && payload.bookId === book.book_id && payload.accessEpoch === book.access_epoch;
    } catch {
      return false;
    }
  }

  /**
   * F16: token gui len co phai JWT dang nhap Creator/Admin THAT khong (chu ky hop le,
   * KHONG co claim `typ` - phan biet voi book access token). Neu dung, tra cuu lai
   * is_system_admin/status TU DATABASE (khong bao gio tin claim trong token - giong
   * dung nguyen tac DbContextInterceptor dang dung cho route co dang nhap thuong).
   */
  private async resolveActor(token: string | undefined): Promise<Actor | null> {
    if (!token) return null;
    let payload: LoginTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<LoginTokenPayload>(token);
    } catch {
      return null;
    }
    if (!payload.sub || payload.typ) return null;
    const { rows } = await this.pool.query<{ is_system_admin: boolean; status: string }>(
      "SELECT is_system_admin, status FROM auth_lookup_user_by_id($1)",
      [payload.sub]
    );
    if (rows.length === 0 || rows[0].status !== "active") return null;
    return { userId: payload.sub, isAdmin: rows[0].is_system_admin };
  }

  private async findPublishedBook(permalink: string): Promise<PublicBookRow> {
    const { slug, suffix } = this.parsePermalink(permalink);
    const { rows } = await this.pool.query("SELECT * FROM public_get_book($1,$2)", [slug, suffix]);
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay sach, hoac sach chua duoc publish.");
    }
    return rows[0];
  }

  /**
   * SEC-02 (audit codex 21/09/2026): "la owner" truoc day chi so sanh users.id, khong
   * xet memberships.status trong dung tenant cua sach - Creator bi Admin thu hoi
   * membership (disable) van doc duoc sach Private cua minh vi tai khoan (users.status)
   * van active. Owner phai co CA users.status active LAN membership active trong tenant
   * cua sach; mat 1 trong 2 dieu kien la mat quyen owner ngay o request ke tiep (khong
   * doi JWT het han - dung nguyen tac "revoke phai co hieu luc ngay" trong REMEDIATION.md).
   * Khong kiem tra tenants.status o day: theo quyet dinh voi nguoi dung (2026-09-21),
   * suspend tenant chi chan Dashboard/API quan tri (xem DbContextInterceptor), khong
   * chan public reader - sach da publish cua tenant suspended van doc duoc binh thuong.
   */
  private async isActiveOwner(actor: Actor | null, book: PublicBookRow): Promise<boolean> {
    if (actor === null || actor.userId !== book.owner_id) return false;
    const { rows } = await this.pool.query<{ status: string | null }>(
      "SELECT public_lookup_membership_status($1,$2) AS status",
      [book.tenant_id, actor.userId]
    );
    return rows.length > 0 && rows[0].status === "active";
  }

  /** Tra ve sach da publish, da xac nhan quyen xem (F16 Private > F05 mat khau > cong khai). */
  private async getAuthorizedBook(permalink: string, token: string | undefined): Promise<PublicBookRow> {
    const book = await this.findPublishedBook(permalink);
    const actor = await this.resolveActor(token);
    const isOwner = await this.isActiveOwner(actor, book);

    if (book.visibility === "private") {
      if (!isOwner && !actor?.isAdmin) {
        throw new ForbiddenException({
          statusCode: 403,
          privateBook: true,
          message: "Sach nay dang o che do rieng tu, chi chu so huu moi xem duoc.",
        });
      }
      if (!isOwner && actor?.isAdmin) {
        // Da chot voi nguoi dung: KHONG co ngoai le, moi lan Admin xem sach Private
        // khong phai cua minh deu phai ghi audit_logs.
        await this.pool.query("SELECT public_record_admin_private_view($1,$2,$3)", [
          actor.userId,
          book.tenant_id,
          book.book_id,
        ]);
      }
      // Private la lop chan cao nhat: bo qua kiem tra mat khau F05 ben duoi hoan toan
      // (khong cong don 2 lop bao ve, da chot voi nguoi dung).
      return book;
    }

    if (book.password_hash && !isOwner && !(await this.hasValidAccessToken(token, book))) {
      throw new ForbiddenException({
        statusCode: 403,
        passwordRequired: true,
        message: "Sach nay yeu cau mat khau de xem.",
      });
    }
    return book;
  }

  /**
   * SEC-01 (audit codex 21/09/2026): sach co mat khau/Private van la "protected
   * content" - KHONG duoc de shared/browser cache giu lai response, du header
   * Cache-Control cu lap luan rang assetId la UUID ngau nhien nen "an toan". UUID
   * kho doan khong phai la authorization: API van nhan Bearer token/`?token=` cho
   * cung URL, nen mot proxy cache dat truoc API co the phuc vu lai byte cua nguoi
   * co quyen cho nguoi khac gui đúng URL (khong kem token) sau khi mat khau/quyen
   * bi doi. Sach cong khai thuc su (khong mat khau, khong Private) van duoc cache
   * binh thuong de giu hieu nang.
   */
  private isProtectedBook(book: PublicBookRow): boolean {
    return book.visibility === "private" || !!book.password_hash;
  }

  private setCacheHeader(res: Response, book: PublicBookRow, publicCacheControl: string): void {
    res.setHeader("Cache-Control", this.isProtectedBook(book) ? "private, no-store" : publicCacheControl);
  }

  /** F12: ghi 1 event 'open'/'page_view' qua ham SECURITY DEFINER (route nay khong co
   * DbContextInterceptor nen khong the INSERT truc tiep qua RLS thuong). Loi ghi nhan
   * KHONG BAO GIO duoc lam hong luong doc sach chinh - chi log, nuot loi. */
  private async recordEvent(book: PublicBookRow, eventType: "open" | "page_view") {
    try {
      await this.pool.query("SELECT public_record_book_event($1,$2,$3,$4)", [
        book.book_id,
        book.tenant_id,
        book.published_revision_id,
        eventType,
      ]);
    } catch {
      // Thong ke la phu, khong chan nguoi doc neu ghi nhan that bai.
    }
  }

  @Get(":permalink")
  async getBook(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") tokenQuery?: string
  ) {
    const book = await this.getAuthorizedBook(permalink, this.extractToken(req, tokenQuery));
    this.setCacheHeader(res, book, "public, max-age=60");
    const manifest = JSON.parse((await this.storage.readBuffer(book.manifest_key)).toString("utf8"));
    const assetsRes = await this.pool.query("SELECT * FROM public_list_page_assets($1,$2)", [
      book.book_id,
      book.published_revision_id,
    ]);
    await this.recordEvent(book, "open");
    return {
      title: book.title,
      permalink: `${book.permalink_slug}-${book.permalink_suffix}`,
      allowDownload: book.allow_download,
      hasBackground: !!book.background_object_key,
      // F06: uu tien GA4 ID rieng cua sach, khong co thi dung mac dinh cua tenant.
      gaId: book.ga_id ?? book.default_ga_id ?? null,
      pages: buildReaderPages(manifest, assetsRes.rows),
    };
  }

  /** F15: anh nen backdrop cong khai - cung 1 kiem tra quyen xem nhu trang/tai xuong. */
  @Get(":permalink/background")
  async getBackground(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") tokenQuery?: string
  ) {
    const book = await this.getAuthorizedBook(permalink, this.extractToken(req, tokenQuery));
    if (!book.background_object_key) {
      throw new NotFoundException("Sach nay khong co anh nen.");
    }
    res.setHeader("Content-Type", book.background_content_type ?? "application/octet-stream");
    this.setCacheHeader(res, book, "public, max-age=3600");
    return new StreamableFile(this.storage.createReadStream(book.background_object_key));
  }

  @Get(":permalink/assets/:assetId")
  async getAsset(
    @Param("permalink") permalink: string,
    @Param("assetId") assetId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") tokenQuery?: string
  ) {
    const book = await this.getAuthorizedBook(permalink, this.extractToken(req, tokenQuery));
    const { rows } = await this.pool.query("SELECT * FROM public_get_page_asset($1,$2)", [
      book.book_id,
      assetId,
    ]);
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay anh.");
    }
    res.setHeader("Content-Type", rows[0].content_type);
    // Anh trang bat bien theo revision, nhung "kho doan URL" khong phai la authorization
    // (xem isProtectedBook) - chi cache cong khai/immutable khi sach thuc su cong khai.
    this.setCacheHeader(res, book, "public, max-age=3600, immutable");
    return new StreamableFile(this.storage.createReadStream(rows[0].object_key));
  }

  /** F11: tai PDF goc - kiem tra ca token (neu co password) LAN allow_download, ca 2 tang. */
  @Get(":permalink/download")
  async download(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") tokenQuery?: string
  ) {
    const book = await this.getAuthorizedBook(permalink, this.extractToken(req, tokenQuery));
    if (!book.allow_download) {
      throw new ForbiddenException("Sach nay khong cho phep tai xuong PDF goc.");
    }
    const { rows } = await this.pool.query("SELECT * FROM public_get_source_pdf($1,$2)", [
      book.book_id,
      book.published_revision_id,
    ]);
    if (rows.length === 0) {
      // Tang SQL (0007) cung kiem tra allow_download=true - neu khong khop (vd bug
      // tang tren, hoac vua tat download giua chung) thi tu choi thay vi lo file.
      throw new ForbiddenException("Sach nay khong cho phep tai xuong PDF goc.");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${rows[0].file_name_hint}"`);
    this.setCacheHeader(res, book, "public, max-age=3600");
    return new StreamableFile(this.storage.createReadStream(rows[0].object_key));
  }

  /** F12: FE goi 1 lan moi khi lat sang trang moi (xem PageView trong FlipBook.tsx) -
   * dung lai getAuthorizedBook nen tu chan giong het cac endpoint khac (Private/mat khau),
   * khong dem luot xem tu nguoi khong xem duoc sach. */
  @Post(":permalink/events")
  async recordPageEvent(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Body() dto: RecordBookEventDto,
    @Query("token") tokenQuery?: string
  ) {
    const book = await this.getAuthorizedBook(permalink, this.extractToken(req, tokenQuery));
    await this.recordEvent(book, dto.eventType);
    return { ok: true };
  }

  /**
   * F05 + SEC-03 (audit codex 21/09/2026): nhap mat khau -> tra ve "book access token"
   * (JWT ngan han) neu dung.
   *
   * Truoc day khoa theo book_settings.locked_until (1 bo dem CHUNG cho ca sach) - mot
   * nguon nhap sai 8 lan khoa CA nguoi khac dang nhap dung mat khau tren cung sach
   * (evidence EVIDENCE.md: "8 password sai... 429; nhap dung tiep theo cung 429").
   * Chuyen sang khoa theo (book_id, ip) qua RateLimitService (Redis, atomic) - mot
   * nguon bi khoa khong anh huong nguon khac. Check truoc ca argon2.verify de tranh
   * ton chi phi hash khi da biet chac se tu choi (REMEDIATION.md muc 3).
   * public_record_password_attempt (DB) van duoc goi de giu thong ke tong hop cho
   * Admin sau nay, KHONG con dung ket qua cua no de quyet dinh chan/cho.
   */
  @Post(":permalink/verify-password")
  async verifyPassword(
    @Param("permalink") permalink: string,
    @Body() dto: VerifyBookPasswordDto,
    @Req() req: Request
  ) {
    const book = await this.findPublishedBook(permalink);
    if (!book.password_hash) {
      throw new BadRequestException("Sach nay khong dat mat khau.");
    }

    const rlKey = `bookpw:${book.book_id}:${req.ip}`;
    const rl = await this.rateLimit.consume(rlKey, PASSWORD_MAX_ATTEMPTS, PASSWORD_LOCK_MINUTES * 60);
    if (!rl.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Da nhap sai qua nhieu lan. Thu lai sau khoang ${Math.ceil(rl.retryAfterSeconds / 60)} phut.`,
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const ok = await argon2.verify(book.password_hash, dto.password).catch(() => false);
    await this.pool
      .query("SELECT public_record_password_attempt($1,$2,$3,$4)", [
        book.book_id,
        ok,
        PASSWORD_MAX_ATTEMPTS,
        PASSWORD_LOCK_MINUTES,
      ])
      .catch(() => undefined);

    if (!ok) {
      throw new UnauthorizedException(`Sai mat khau. Con toi da ${rl.remaining} lan thu tu dia chi nay.`);
    }
    await this.rateLimit.reset(rlKey);

    const accessToken = await this.jwtService.signAsync(
      { typ: BOOK_ACCESS_TOKEN_TYP, bookId: book.book_id, accessEpoch: book.access_epoch } satisfies BookAccessTokenPayload,
      { expiresIn: BOOK_ACCESS_TOKEN_TTL_SECONDS }
    );
    return { accessToken, expiresIn: BOOK_ACCESS_TOKEN_TTL_SECONDS };
  }
}
