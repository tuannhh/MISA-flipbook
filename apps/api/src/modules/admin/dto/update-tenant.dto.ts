import { IsIn, IsOptional, IsString, Matches, ValidateIf } from "class-validator";
import { GA4_MEASUREMENT_ID_RE } from "../../books/dto/update-book-settings.dto";

export class UpdateTenantDto {
  // F06: GA4 Measurement ID mac dinh cho CA TENANT - sach nao khong tu dat rieng
  // (book_settings.ga_id) se dung ID nay. null = xoa mac dinh; khong gui field = giu nguyen.
  @IsOptional()
  @ValidateIf((o) => o.defaultGaId !== null)
  @IsString()
  @Matches(GA4_MEASUREMENT_ID_RE, { message: "GA4 Measurement ID phai dung dinh dang G-XXXXXXXXXX." })
  defaultGaId?: string | null;

  // F13: Admin tam ngung/kich hoat lai 1 tenant (vd tenant vi pham/ngung hop tac) -
  // khong gui field = giu nguyen trang thai hien tai.
  @IsOptional()
  @IsIn(["active", "suspended"])
  status?: "active" | "suspended";
}
