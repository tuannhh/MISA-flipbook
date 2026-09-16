import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdateBookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}
