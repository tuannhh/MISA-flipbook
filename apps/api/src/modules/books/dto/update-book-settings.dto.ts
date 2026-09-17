import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from "class-validator";

// F06: dinh dang GA4 Measurement ID chinh thuc cua Google (vd G-ABC1234DEF).
export const GA4_MEASUREMENT_ID_RE = /^G-[A-Z0-9]{4,20}$/;

export class UpdateBookSettingsDto {
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  // F16: cong tac Publish/Private tren sach DA publish - "public" (mac dinh, ai co link
  // deu xem duoc) hoac "private" (chi owner + system admin xem duoc qua chinh permalink).
  @IsOptional()
  @IsIn(["public", "private"])
  visibility?: "public" | "private";

  @IsOptional()
  @IsUUID()
  thumbnailAssetId?: string;

  // Dat/doi mat khau xem sach (F05). Gui plaintext qua HTTPS, API tu hash bang argon2 -
  // KHONG bao gio luu/tra ve plaintext. Bo trong = khong doi mat khau hien tai.
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  password?: string;

  // true = xoa mat khau (sach lai public hoan toan). Uu tien hon `password` neu ca 2 cung gui.
  @IsOptional()
  @IsBoolean()
  removePassword?: boolean;

  // F06: GA4 Measurement ID rieng cho sach nay (ghi de mac dinh cua tenant). Khong nhan
  // JavaScript tuy y - CHI 1 chuoi ID dung dinh dang, controller tu chen vao script
  // gtag.js co dinh, khong bao gio eval/render truc tiep gia tri nguoi dung gui len.
  // gui null = xoa rieng (quay lai dung mac dinh tenant); khong gui field = giu nguyen.
  @IsOptional()
  @ValidateIf((o) => o.gaId !== null)
  @IsString()
  @Matches(GA4_MEASUREMENT_ID_RE, { message: "GA4 Measurement ID phai dung dinh dang G-XXXXXXXXXX." })
  gaId?: string | null;
}
