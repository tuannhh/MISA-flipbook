import { Module } from "@nestjs/common";
import { DbModule } from "./common/db/db.module";
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
export class AppModule {}
