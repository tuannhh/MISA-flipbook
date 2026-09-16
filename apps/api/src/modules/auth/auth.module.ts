import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "../../common/auth/jwt.strategy";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";

// Global de moi module (Me/Admin/Books/Jobs) dung duoc @UseGuards(JwtAuthGuard)
// ma khong phai tu import PassportModule rieng o tung noi.
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      // Giay (so), tranh loi kieu voi union StringValue cua thu vien 'ms'. Mac dinh 8 gio.
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN_SECONDS
          ? Number(process.env.JWT_EXPIRES_IN_SECONDS)
          : 8 * 60 * 60,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard, PassportModule],
})
export class AuthModule {}
