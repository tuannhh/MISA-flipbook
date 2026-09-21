import { Global, Module } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.tokens";
import { RateLimitService } from "./rate-limit.service";

/**
 * SEC-03 (audit codex 21/09/2026): API truoc day khong co Redis, khong co throttle
 * cho login/verify-password - dung lai ioredis giong dispatcher/worker-convert (cung
 * REDIS_URL, cung instance Redis trong docker-compose) thay vi them ha tang moi.
 *
 * Redis commands co deadline ngan va fallback bounded per-process trong service, nen
 * Redis khong bien login/password reader thanh single point of failure.
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
        const redis = new Redis(url, {
          lazyConnect: false,
          enableOfflineQueue: false,
          connectTimeout: Number(process.env.RATE_LIMIT_CONNECT_TIMEOUT_MS ?? 500),
          maxRetriesPerRequest: 0,
          retryStrategy: (times) => Math.min(times * 200, 2000),
        });
        // ioredis emits an "error" event even though every command failure is
        // handled by RateLimitService. Registering a listener prevents noisy
        // unhandled-event stacks during an expected Redis outage; the service logs
        // one redacted warning per minute when it switches to its fallback.
        redis.on("error", () => undefined);
        return redis;
      },
    },
    RateLimitService,
  ],
  exports: [RateLimitService],
})
export class RateLimitModule {}
