import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { JwtPayload } from "./jwt-payload.interface";
import { DASHBOARD_SESSION_COOKIE, readCookie } from "./session-cookie";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("Thieu bien moi truong JWT_SECRET.");
    }
    super({
      jwtFromRequest: (req) => ExtractJwt.fromAuthHeaderAsBearerToken()(req) ?? readCookie(req, DASHBOARD_SESSION_COOKIE) ?? null,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // Chi xac minh chu ky/het han. KHONG tin is_system_admin/status tu token -
  // DbContextInterceptor se doc lai tu DB moi request (xem common/tenant).
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    return payload;
  }
}
