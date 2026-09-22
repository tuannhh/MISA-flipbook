import { Body, Controller, HttpException, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { rateLimitKeyPart, RateLimitService } from "../../common/rate-limit/rate-limit.service";
import { clearBrowserSession, issueBrowserSession } from "../../common/auth/session-cookie";

const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 10);
const LOGIN_IP_MAX_ATTEMPTS = Number(process.env.LOGIN_IP_MAX_ATTEMPTS ?? 30);
const LOGIN_WINDOW_SECONDS = Number(process.env.LOGIN_WINDOW_SECONDS ?? 15 * 60);

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimit: RateLimitService
  ) {}

  /**
   * SEC-03 (audit codex 21/09/2026): truoc day khong co gioi han so lan dang nhap sai -
   * evidence 10 lan sai lien tiep deu tra 401, khong 429. Khoa theo (ip, email) - mot
   * IP thu credential-stuffing tren nhieu email khac nhau van bi cham theo tung email,
   * dong thoi khong khoa oan toan bo nguoi dung cung mang NAT/proxy chia se IP khi ho
   * dang nhap dung email cua rieng minh.
   *
   * Docker pilot chi mo API sau mot Nginx proxy va `TRUST_PROXY_HOPS=1`, nen req.ip
   * la client address sau khi proxy da ghi de X-Forwarded-For. Deploy khac phai dat
   * dung topology da chot (direct API = 0); khong duoc bat trust proxy tuy y.
   */
  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string }> {
    const email = dto.email.trim().toLowerCase();
    const sourceKey = `login-ip:${rateLimitKeyPart(`source:${req.ip}`)}`;
    const accountKey = `login-account:${rateLimitKeyPart(`account:${req.ip}:${email}`)}`;
    const sourceResult = await this.rateLimit.consume(sourceKey, LOGIN_IP_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    if (!sourceResult.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Da co qua nhieu lan dang nhap tu ket noi nay. Vui long thu lai sau.",
          retryAfterSeconds: sourceResult.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    const accountResult = await this.rateLimit.consume(accountKey, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    if (!accountResult.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Da dang nhap sai qua nhieu lan. Vui long thu lai sau.",
          retryAfterSeconds: accountResult.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    const login = await this.authService.login(dto.email, dto.password);
    await Promise.all([this.rateLimit.reset(accountKey), this.rateLimit.reset(sourceKey)]);
    issueBrowserSession(res, req, login.accessToken);
    res.setHeader("Cache-Control", "private, no-store");
    // Keep this response for API/CLI compatibility. The browser Dashboard ignores
    // it and uses the HttpOnly cookie set above instead of persisting a JWT.
    return login;
  }

  @Post("logout")
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): { ok: true } {
    clearBrowserSession(res, req);
    res.setHeader("Cache-Control", "private, no-store");
    return { ok: true };
  }
}
