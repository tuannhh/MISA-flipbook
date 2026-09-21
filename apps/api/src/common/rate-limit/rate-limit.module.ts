import { Global, Module } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.tokens";
import { RateLimitService } from "./rate-limit.service";

/**
 * SEC-03 (audit codex 21/09/2026): API truoc day khong co Redis, khong co throttle
 * cho login/verify-password - dung lai ioredis giong dispatcher/worker-convert (cung
 * REDIS_URL, cung instance Redis trong docker-compose) thay vi them ha tang moi.
 *
 * lazyConnect + retryStrategy gioi han: neu Redis chet, RateLimitService fail-open
 * (xem rate-limit.service.ts) - khong bien Redis thanh single point of failure lam
 * sap tinh nang dang nhap/xem sach co mat khau.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) {
          throw new Error("Thieu bien moi truong REDIS_URL (rate limit dang nhap/mat khau sach).");
        }
        return new Redis(url, {
          lazyConnect: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (times) => Math.min(times * 200, 2000),
        });
      },
    },
    RateLimitService,
  ],
  exports: [RateLimitService],
})
export class RateLimitModule {}
