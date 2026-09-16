import { IsUUID } from "class-validator";

export class CreateMembershipDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;
}
