import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { CsrfMiddleware } from "./common/auth/csrf.middleware";
import { DbModule } from "./common/db/db.module";
import { RateLimitModule } from "./common/rate-limit/rate-limit.module";
import { StorageModule } from "./storage/storage.module";
import { AuthModule } from "./modules/auth/auth.module";
import { MeModule } from "./modules/me/me.module";
import { AdminModule } from "./modules/admin/admin.module";
import { BooksModule } from "./modules/books/books.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { HealthModule } from "./modules/health/health.module";
import { PublicModule } from "./modules/public/public.module";

@Module({
  imports: [
    DbModule,
    RateLimitModule,
    StorageModule,
    AuthModule,
    MeModule,
    AdminModule,
    BooksModule,
    JobsModule,
    HealthModule,
    PublicModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes("*");
  }
}