import { IsUUID } from "class-validator";

export class PublishBookDto {
  @IsUUID()
  revisionId!: string;
}
