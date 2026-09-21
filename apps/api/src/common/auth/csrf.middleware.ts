import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { CSRF_COOKIE, CSRF_HEADER, DASHBOARD_SESSION_COOKIE, csrfTokensMatch, readCookie } from "./session-cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF protection applies only when authentication arrives from
 * the Dashboard HttpOnly cookie. Bearer API clients stay stateless and public
 * endpoints without a Dashboard cookie do not acquire a hidden CSRF dependency.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method) || !readCookie(req, DASHBOARD_SESSION_COOKIE)) {
      next();
      return;
    }
    const supplied = req.header(CSRF_HEADER);
    if (csrfTokensMatch(readCookie(req, CSRF_COOKIE), supplied)) {
      next();
      return;
    }
    res.status(403).json({ statusCode: 403, message: "Yeu cau tu phien trinh duyet thieu CSRF token." });
  }
}