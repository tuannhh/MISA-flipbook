import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { Pool } from "pg";
import { DB_POOL } from "../../common/db/db.tokens";
import { STORAGE_ADAPTER, StorageAdapter } from "../../storage/storage.interface";
import { buildReaderPages } from "../books/util/build-reader-pages";

/**
 * Doc sach cong khai (khong dang nhap) - KHONG dung DbContextInterceptor (doi hoi JWT).
 * Moi truy van di qua ham SECURITY DEFINER trong infra/migrations/0006_public_reader.sql,
 * tu gioi han chi tra ve du lieu cua sach da publish va khong bao gio lo source_pdf.
 */
@Controller("public/books")
export class PublicBooksController {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter
  ) {}

  private parsePermalink(permalink: string): { slug: string; suffix: string } {
    const lastDash = permalink.lastIndexOf("-");
    if (lastDash < 0 || permalink.length - lastDash - 1 !== 8) {
      throw new NotFoundException("Link khong hop le.");
    }
    return { slug: permalink.slice(0, lastDash), suffix: permalink.slice(lastDash + 1) };
  }

  private async getPublishedBook(permalink: string) {
    const { slug, suffix } = this.parsePermalink(permalink);
    const { rows } = await this.pool.query("SELECT * FROM public_get_book($1,$2)", [slug, suffix]);
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay sach, hoac sach chua duoc publish.");
    }
    const book = rows[0];
    if (book.has_password) {
      // Mat khau bao ve la pham vi P3 (chua trien khai kiem tra mat khau); chan an toan
      // thay vi lo noi dung khi Creator da bat password.
      throw new ForbiddenException("Sach yeu cau mat khau - chua ho tro trong ban P2 nay.");
    }
    return book;
  }

  @Get(":permalink")
  async getBook(@Param("permalink") permalink: string) {
    const book = await this.getPublishedBook(permalink);
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
    @Res({ passthrough: true }) res: Response
  ) {
    const book = await this.getPublishedBook(permalink);
    const { rows } = await this.pool.query("SELECT * FROM public_get_page_asset($1,$2)", [
      book.book_id,
      assetId,
    ]);
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay anh.");
    }
    res.setHeader("Content-Type", rows[0].content_type);
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    return new StreamableFile(this.storage.createReadStream(rows[0].object_key));
  }
}
