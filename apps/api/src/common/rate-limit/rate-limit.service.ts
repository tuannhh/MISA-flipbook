import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.tokens";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
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

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Tang bo dem tai `key`, cua so `windowSeconds`. Fail-open neu Redis loi/timeout -
   * throttle la lop phong ngu bo sung, khong duoc bien Redis thanh single point of
   * failure lam sap dang nhap/xem sach co mat khau khi Redis tam ngung. */
  async consume(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
      const [count, ttlMs] = (await this.redis.eval(
        CONSUME_SCRIPT,
        1,
        key,
        String(windowSeconds * 1000)
      )) as [number, number];
      const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      // count < max (khong phai <=): "toi da N lan thu" nghia la lan thu thu N chinh
      // no da bi khoa, giong het hanh vi khoa cu (book_settings: locked khi
      // failed_attempts >= max NGAY trong lan cap nhat dua so dem len max do).
      return { allowed: count < max, remaining: Math.max(0, max - count), retryAfterSeconds };
    } catch (err) {
      this.logger.warn(`Rate limit fail-open cho key="${key}": ${(err as Error).message}`);
      return { allowed: true, remaining: max, retryAfterSeconds: 0 };
    }
  }

  /** Xoa bo dem (vd dang nhap thanh cong) de khong cong don sang lan sau. */
  async reset(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`Rate limit reset loi cho key="${key}": ${(err as Error).message}`);
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
    try {
      let cursor = "0";
      do {
        const [next, keys] = await this.redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
        cursor = next;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== "0");
    } catch (err) {
      this.logger.warn(`Rate limit resetByPrefix loi cho prefix="${prefix}": ${(err as Error).message}`);
    }
  }
}
