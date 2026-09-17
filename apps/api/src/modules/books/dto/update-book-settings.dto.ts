import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class UpdateBookSettingsDto {
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

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
}
