import { IsIn } from "class-validator";

export class RecordBookEventDto {
  // F12: chi nhan 'page_view' tu client - 'open' da tu dong ghi nhan trong getBook()
  // (moi lan tai sach thanh cong), khong cho client tu goi 'open' de tranh gia mao so.
  @IsIn(["page_view"])
  eventType!: "page_view";
}
