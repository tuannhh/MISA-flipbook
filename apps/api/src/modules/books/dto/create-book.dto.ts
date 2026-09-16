import { IsString, MinLength } from "class-validator";

export class CreateBookDto {
  @IsString()
  @MinLength(1)
  title!: string;
}
