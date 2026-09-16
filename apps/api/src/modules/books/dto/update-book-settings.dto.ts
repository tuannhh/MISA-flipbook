import { IsBoolean, IsOptional, IsUUID } from "class-validator";

export class UpdateBookSettingsDto {
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @IsOptional()
  @IsUUID()
  thumbnailAssetId?: string;
}
