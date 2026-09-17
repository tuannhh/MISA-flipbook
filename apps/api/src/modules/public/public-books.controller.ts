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

const BOOK_ACCESS_TOKEN_TYP = "book_access";
const BOOK_ACCESS_TOKEN_TTL_SECONDS = Number(process.env.BOOK_ACCESS_TOKEN_TTL_SECONDS ?? 12 * 60 * 60);
const PASSWORD_MAX_ATTEMPTS = Number(process.env.BOOK_PASSWORD_MAX_ATTEMPTS ?? 8);
const PASSWORD_LOCK_MINUTES = Number(process.env.BOOK_PASSWORD_LOCKOUT_MINUTES ?? 15);

interface PublicBookRow {
  book_id: string;
  tenant_id: string;
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
}

interface BookAccessTokenPayload {
  typ: string;
  bookId: string;
  accessEpoch: number;
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
 */
@Controller("public/books")
export class PublicBooksController {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly jwtService: JwtService
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

  private async findPublishedBook(permalink: string): Promise<PublicBookRow> {
    const { slug, suffix } = this.parsePermalink(permalink);
    const { rows } = await this.pool.query("SELECT * FROM public_get_book($1,$2)", [slug, suffix]);
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay sach, hoac sach chua duoc publish.");
    }
    return rows[0];
  }

  /** Tra ve sach da publish, da xac nhan quyen xem (khong password, hoac co token hop le). */
  private async getAuthorizedBook(permalink: string, token: string | undefined): Promise<PublicBookRow> {
    const book = await this.findPublishedBook(permalink);
    if (book.password_hash && !(await this.hasValidAccessToken(token, book))) {
      throw new ForbiddenException({
        statusCode: 403,
        passwordRequired: true,
        message: "Sach nay yeu cau mat khau de xem.",
      });
    }
    return book;
  }

  @Get(":permalink")
  async getBook(
    @Param("permalink") permalink: string,
    @Req() req: Request,
    @Query("token") tokenQuery?: string
  ) {
    const book = await this.getAuthorizedBook(permalink, this.extractToken(req, tokenQuery));
    const manifest = JSON.parse((await this.storage.readBuffer(book.manifest_key)).toString("utf8"));
    const assetsRes = await this.pool.query("SELECT * FROM public_list_page_assets($1,$2)", [
      book.book_id,
      book.published_revision_id,
    ]);
    return {
      title: book.title,
      permalink: `${book.permalink_slug}-${book.permalink_suffix}`,
      allowDownload: book.allow_download,
      pages: buildReaderPages(manifest, assetsRes.rows),
    };
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
    // Anh trang chi phu thuoc revision (bat bien sau khi sinh), khong phu thuoc mat
    // khau/quyen doc - cache cong khai an toan ke ca voi sach co password vi assetId
    // la UUID ngau nhien, khong doan duoc tu permalink.
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
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
    return new StreamableFile(this.storage.createReadStream(rows[0].object_key));
  }

  /** F05: nhap mat khau -> tra ve "book access token" (JWT ngan han) neu dung. */
  @Post(":permalink/verify-password")
  async verifyPassword(@Param("permalink") permalink: string, @Body() dto: VerifyBookPasswordDto) {
    const book = await this.findPublishedBook(permalink);
    if (!book.password_hash) {
      throw new BadRequestException("Sach nay khong dat mat khau.");
    }
    if (book.locked_until && new Date(book.locked_until).getTime() > Date.now()) {
      const retryAfterSeconds = Math.ceil((new Date(book.locked_until).getTime() - Date.now()) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Da nhap sai qua nhieu lan. Thu lai sau khoang ${Math.ceil(retryAfterSeconds / 60)} phut.`,
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const ok = await argon2.verify(book.password_hash, dto.password).catch(() => false);
    const { rows: attemptRows } = await this.pool.query(
      "SELECT * FROM public_record_password_attempt($1,$2,$3,$4)",
      [book.book_id, ok, PASSWORD_MAX_ATTEMPTS, PASSWORD_LOCK_MINUTES]
    );
    const attempt = attemptRows[0];

    if (!ok) {
      if (attempt.locked_until) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Sai mat khau qua nhieu lan. Da khoa tam thoi ${PASSWORD_LOCK_MINUTES} phut.`,
            retryAfterSeconds: PASSWORD_LOCK_MINUTES * 60,
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      const remaining = Math.max(0, PASSWORD_MAX_ATTEMPTS - attempt.failed_attempts);
      throw new UnauthorizedException(`Sai mat khau. Con toi da ${remaining} lan thu truoc khi bi khoa tam thoi.`);
    }

    const accessToken = await this.jwtService.signAsync(
      { typ: BOOK_ACCESS_TOKEN_TYP, bookId: book.book_id, accessEpoch: book.access_epoch } satisfies BookAccessTokenPayload,
      { expiresIn: BOOK_ACCESS_TOKEN_TTL_SECONDS }
    );
    return { accessToken, expiresIn: BOOK_ACCESS_TOKEN_TTL_SECONDS };
  }
}
