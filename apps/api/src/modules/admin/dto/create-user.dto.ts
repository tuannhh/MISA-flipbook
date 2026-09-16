import { IsBoolean, IsEmail, IsOptional, MinLength } from "class-validator";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @MinLength(8, { message: "Mat khau toi thieu 8 ky tu." })
  password!: string;

  @IsOptional()
  @IsBoolean()
  isSystemAdmin?: boolean;
}
