import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "./db.tokens";
import { DbContextInterceptor } from "../tenant/db-context.interceptor";

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error("Thieu bien moi truong DATABASE_URL (ket noi bang role app_user).");
        }
        // Runtime connection PHAI dung role app_user (khong superuser, khong BYPASSRLS) -
        // xem infra/migrations/README.md. Pool nho vi pilot 1-2 instance API.
        return new Pool({ connectionString, max: 10 });
      },
    },
    // Dang ky global de cac controller dung @UseInterceptors(DbContextInterceptor)
    // resolve duoc dependency (DB_POOL, Reflector) qua DI container.
    DbContextInterceptor,
  ],
  exports: [DB_POOL, DbContextInterceptor],
})
export class DbModule {}
