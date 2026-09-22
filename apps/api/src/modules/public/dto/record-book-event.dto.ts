import { IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from "class-validator";

export class RecordBookEventDto {
  // An "open" is sent by the browser only after a reader session has loaded.  The
  // server deduplicates it by signed session id, so SSR metadata requests and retry
  // traffic cannot inflate statistics.
  @IsIn(["open", "page_view"])
  eventType!: "open" | "page_view";

  @ValidateIf((o) => o.eventType === "page_view")
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;
}
