import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, from } from "rxjs";
import { Pool } from "pg";
import { DB_POOL } from "../db/db.tokens";
import { REQUIRE_TENANT_KEY } from "./require-tenant.decorator";
import { AuthedRequest } from "./authed-request";

/**
 * Gan context tenant/user vao MOT transaction Postgres cho toan bo request, dung
 * dung role runtime app_user (khong superuser) - xem ARCHITECTURE.md muc 4 va
 * infra/migrations/0003_rls_policies.sql.
 *
 * Khong bao gio tin tenant_id do client tu khai bao: header x-tenant-id chi duoc
 * chap nhan SAU KHI xac nhan co membership active trong bang memberships (tru khi
 * la system admin). Day la lop kiem tra o tang ung dung; RLS o tang DB la lop
 * phong ve thu hai neu tang nay co bug.
 */
@Injectable()
export class DbContextInterceptor implements NestInterceptor {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly reflector: Reflector
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.run(context, next));
  }

  private async run(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const jwtUserId = req.user?.sub;
    if (!jwtUserId) {
      throw new UnauthorizedException("Thieu thong tin xac thuc.");
    }

    const client = await this.pool.connect();
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [jwtUserId]);

      const { rows } = await client.query(
        "SELECT is_system_admin, status FROM users WHERE id = $1",
        [jwtUserId]
      );
      if (rows.length === 0 || rows[0].status !== "active") {
        throw new UnauthorizedException("Tai khoan khong ton tai hoac da bi khoa.");
      }
      const isAdmin: boolean = rows[0].is_system_admin;
      await client.query("SELECT set_config('app.is_system_admin', $1, true)", [
        String(isAdmin),
      ]);

      // getAllAndOverride vi @RequireTenant() thuong duoc gan o CAP CONTROLLER
      // (vd BooksController), khong phai tung method rieng le.
      const requireTenant = this.reflector.getAllAndOverride<boolean>(REQUIRE_TENANT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      let tenantId: string | undefined;
      if (requireTenant) {
        const header = req.headers["x-tenant-id"];
        tenantId = Array.isArray(header) ? header[0] : header;
        if (!tenantId) {
          throw new BadRequestException("Thieu header x-tenant-id.");
        }
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        if (!isAdmin) {
          const membership = await client.query(
            "SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'",
            [tenantId, jwtUserId]
          );
          if (membership.rowCount === 0) {
            throw new ForbiddenException("Ban khong thuoc tenant nay.");
          }
        }
      }

      req.dbClient = client;
      req.isAdmin = isAdmin;
      req.userId = jwtUserId;
      req.tenantId = tenantId;

      const result = await lastValue(next.handle());
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

function lastValue<T>(obs: Observable<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let value: T;
    obs.subscribe({
      next: (v) => {
        value = v;
      },
      error: reject,
      complete: () => resolve(value),
    });
  });
}
