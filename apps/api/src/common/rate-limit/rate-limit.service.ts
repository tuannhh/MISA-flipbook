import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac } from "crypto";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.tokens";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Redis and fallback keys must not retain a raw email or source address. Keep a
 * distinct secret when available so rotating a dashboard JWT does not reset an
 * active rate-limit window; JWT_SECRET remains a safe Docker-pilot fallback.
 */
export function rateLimitKeyPart(value: string): string {
  const secret = process.env.RATE_LIMIT_KEY_SECRET || process.env.JWT_SECRET || "development-rate-limit-key";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

interface LocalCounter {
  count: number;
  expiresAt: number;
  touchedAt: number;
}

// INCR nguyen tu + dat TTL o lan dau tien (NX qua nhanh check count===1) - tranh
// race "doc-roi-tang" ma audit chi ra o public_record_password_attempt (0007):
// nhieu request cung luc cung SELECT thay so cu, cung UPDATE +1, mat 1 lan tang.
// INCR cua Redis la 1 lenh nguyen tu duy nhat, khong co khoang ho giua doc/ghi.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

/**
 * SEC-03 (audit codex 21/09/2026): bo dem atomic co TTL trong Redis, khoa theo key
 * do caller ghep san (vd "login:<ip>:<email>" hoac "bookpw:<bookId>:<ip>") - khong
 * khoa toan cuc theo 1 tai nguyen duy nhat nhu book_settings.failed_attempts cu
 * (mot nguon sai mat khau lam khoa TAT CA nguoi doc khac, evidence: 8 lan sai tu 1
 * nguon -> 429 cho ca nguon nhap dung tiep theo).
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly fallback = new Map<string, LocalCounter>();
  private readonly commandTimeoutMs = this.positiveInt(process.env.RATE_LIMIT_COMMAND_TIMEOUT_MS, 500);
  private readonly fallbackMaxKeys = this.positiveInt(process.env.RATE_LIMIT_FALLBACK_MAX_KEYS, 10_000);
  private lastFallbackWarningAt = 0;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private positiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async withinDeadline<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error("rate_limit_backend_timeout")), this.commandTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private trimFallback(now: number): void {
    for (const [key, value] of this.fallback) {
      if (value.expiresAt <= now) this.fallback.delete(key);
    }
    while (this.fallback.size >= this.fallbackMaxKeys) {
      let oldestKey: string | undefined;
      let oldestTouchedAt = Number.POSITIVE_INFINITY;
      for (const [key, value] of this.fallback) {
        if (value.touchedAt < oldestTouchedAt) {
          oldestKey = key;
          oldestTouchedAt = value.touchedAt;
        }
      }
      if (!oldestKey) return;
      this.fallback.delete(oldestKey);
    }
  }

  private consumeFallback(key: string, max: number, windowSeconds: number): RateLimitResult {
    const now = Date.now();
    let counter = this.fallback.get(key);
    if (!counter || counter.expiresAt <= now) {
      this.trimFallback(now);
      counter = { count: 0, expiresAt: now + windowSeconds * 1000, touchedAt: now };
      this.fallback.set(key, counter);
    }
    counter.count += 1;
    counter.touchedAt = now;
    return {
      allowed: counter.count < max,
      remaining: Math.max(0, max - counter.count),
      retryAfterSeconds: Math.max(1, Math.ceil((counter.expiresAt - now) / 1000)),
    };
  }

  private warnFallback(err: unknown): void {
    const now = Date.now();
    // Do not put a rate-limit key (which may contain email/IP) into logs, and avoid
    // flooding logs when Redis is down for an extended period.
    if (now - this.lastFallbackWarningAt >= 60_000) {
      this.lastFallbackWarningAt = now;
      this.logger.warn(`Redis rate limit unavailable; using bounded per-process fallback: ${(err as Error).message}`);
    }
  }

  /** Tang bo dem tai `key`, cua so `windowSeconds`. Redis la nguon dung chung; neu no
   * loi/tre qua deadline, fallback per-process van chan brute force ma khong de Redis
   * tro thanh single point of failure. */
  async consume(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
      const [count, ttlMs] = (await this.withinDeadline(this.redis.eval(
        CONSUME_SCRIPT,
        1,
        key,
        String(windowSeconds * 1000)
      ))) as [number, number];
      const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      // count < max (khong phai <=): "toi da N lan thu" nghia la lan thu thu N chinh
      // no da bi khoa, giong het hanh vi khoa cu (book_settings: locked khi
      // failed_attempts >= max NGAY trong lan cap nhat dua so dem len max do).
      return { allowed: count < max, remaining: Math.max(0, max - count), retryAfterSeconds };
    } catch (err) {
      this.warnFallback(err);
      return this.consumeFallback(key, max, windowSeconds);
    }
  }

  /** Xoa bo dem (vd dang nhap thanh cong) de khong cong don sang lan sau. */
  async reset(key: string): Promise<void> {
    this.fallback.delete(key);
    try {
      await this.withinDeadline(this.redis.del(key));
    } catch (err) {
      this.warnFallback(err);
    }
  }

  /**
   * Xoa TAT CA khoa bat dau bang `prefix` (vd "bookpw:<bookId>:" - moi IP tung thu sai
   * la 1 khoa rieng). Dung khi chu so huu doi/xoa mat khau sach: hanh vi cu (DB
   * failed_attempts/locked_until, xem books.controller.ts putSettings) luon reset ve 0
   * moi khi access_epoch tang - giu nguyen ky vong "doi mat khau = bat dau lai tu dau"
   * (phat hien qua p3_e2e.test.js chay that: khoa theo IP cu con hieu luc 15 phut se lam
   * chinh chu so huu tu khoa minh khoi sach cua ho sau khi da dat mat khau moi).
   * SCAN (khong dung KEYS) de khong chan Redis mot lan quet lon tren instance dung chung.
   */
  async resetByPrefix(prefix: string): Promise<void> {
    for (const key of this.fallback.keys()) {
      if (key.startsWith(prefix)) this.fallback.delete(key);
    }
    try {
      let cursor = "0";
      do {
        const [next, keys] = await this.withinDeadline(this.redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100));
        cursor = next;
        if (keys.length > 0) {
          await this.withinDeadline(this.redis.del(...keys));
        }
      } while (cursor !== "0");
    } catch (err) {
      this.warnFallback(err);
    }
  }
}
