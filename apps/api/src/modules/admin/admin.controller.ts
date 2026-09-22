import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import * as argon2 from "argon2";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { DbContextInterceptor } from "../../common/tenant/db-context.interceptor";
import { AuthedRequest } from "../../common/tenant/authed-request";
import { assertAdmin } from "../../common/tenant/assert-admin";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { UpdateTenantDto } from "./dto/update-tenant.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

const JOB_STATES = ["queued", "processing", "done", "failed"] as const;

// Tat ca route o day chi Admin (system admin) dung - PLAN.md muc 3: "Quan ly
// user/tenant/cau hinh he thong: chi Admin". Khong co dang ky cong khai (khoan 7).
// Khong gan @RequireTenant() - Admin xem/quan ly XUYEN TENANT, dua vao RLS
// "*_admin_all" (0003_rls_policies.sql) da bat qua khi app.is_system_admin=true.
@Controller("admin")
@UseGuards(JwtAuthGuard)
@UseInterceptors(DbContextInterceptor)
export class AdminController {
  @Post("tenants")
  async createTenant(@Req() req: AuthedRequest, @Body() dto: CreateTenantDto) {
    assertAdmin(req);
    const { rows } = await req.dbClient.query(
      "INSERT INTO tenants (name) VALUES ($1) RETURNING id, name, status, created_at",
      [dto.name]
    );
    return rows[0];
  }

  // F13: liet ke toan bo tenant kem so lieu tong hop (so thanh vien/sach/dung luong) -
  // man Admin can thay ngay quy mo tung tenant ma khong phai bam vao tung sach.
  @Get("tenants")
  async listTenants(@Req() req: AuthedRequest) {
    assertAdmin(req);
    const { rows } = await req.dbClient.query(
      `SELECT t.id, t.name, t.status, t.default_ga_id, t.created_at,
        (SELECT COUNT(*) FROM memberships m WHERE m.tenant_id = t.id AND m.status = 'active') AS member_count,
        (SELECT COUNT(*) FROM books b WHERE b.tenant_id = t.id) AS book_count,
        (SELECT COALESCE(SUM(a.bytes), 0) FROM assets a WHERE a.tenant_id = t.id) AS storage_bytes
       FROM tenants t
       ORDER BY t.created_at DESC`
    );
    return rows;
  }

  @Post("users")
  async createUser(@Req() req: AuthedRequest, @Body() dto: CreateUserDto) {
    assertAdmin(req);
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const { rows } = await req.dbClient.query(
      "INSERT INTO users (email, password_hash, is_system_admin) VALUES ($1,$2,$3) RETURNING id, email, is_system_admin, status, created_at",
      [dto.email, passwordHash, dto.isSystemAdmin ?? false]
    );
    return rows[0];
  }

  // F13: liet ke toan bo tai khoan kem danh sach tenant da tham gia (moi user co the
  // thuoc nhieu tenant qua memberships) - dung json_agg vi 1-nhieu, khong the JOIN thang.
  @Get("users")
  async listUsers(@Req() req: AuthedRequest) {
    assertAdmin(req);
    const { rows } = await req.dbClient.query(
      `SELECT u.id, u.email, u.is_system_admin, u.status, u.created_at,
        COALESCE(
          json_agg(json_build_object('tenantId', m.tenant_id, 'tenantName', t.name, 'status', m.status))
            FILTER (WHERE m.id IS NOT NULL),
          '[]'
        ) AS memberships
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    return rows;
  }

  // F13: khoa/mo tai khoan - vd tai khoan bi lam dung. Ghi audit_logs vi day la thao
  // tac quan tri anh huong truc tiep nguoi dung khac (khac voi cac endpoint POST tao
  // moi o tren, chua co audit rieng vi PLAN.md chi yeu cau audit cho hanh dong nhay cam).
  @Patch("users/:id/status")
  async updateUserStatus(@Req() req: AuthedRequest, @Param("id") userId: string, @Body() dto: UpdateUserStatusDto) {
    assertAdmin(req);
    const before = await req.dbClient.query("SELECT status FROM users WHERE id = $1", [userId]);
    if (before.rowCount === 0) {
      throw new NotFoundException("Khong tim thay tai khoan.");
    }
    const fromStatus = before.rows[0].status;
    const { rows } = await req.dbClient.query(
      "UPDATE users SET status = $2 WHERE id = $1 RETURNING id, email, is_system_admin, status, created_at",
      [userId, dto.status]
    );
    if (fromStatus !== dto.status) {
      await req.dbClient.query(
        `INSERT INTO audit_logs (actor_user_id, tenant_id, action, resource_id, metadata)
         VALUES ($1, NULL, 'user_status_change', $2, $3::jsonb)`,
        [req.userId, userId, JSON.stringify({ from: fromStatus, to: dto.status })]
      );
    }
    return rows[0];
  }

  // F06: Admin dat GA4 Measurement ID mac dinh cho ca tenant (tenants.default_ga_id da
  // co san tu schema P1, chua tung duoc doc/ghi qua API truoc dot F06 nay).
  // F13: mo rong them "status" (active/suspended) - tam ngung 1 tenant, ghi audit_logs.
  @Patch("tenants/:id")
  async updateTenant(@Req() req: AuthedRequest, @Param("id") tenantId: string, @Body() dto: UpdateTenantDto) {
    assertAdmin(req);
    // Xem chu thich tuong tu trong books.controller.ts putSettings: PHAI kiem tra
    // req.body THO, khong phai instance `dto` (class field ES2022 luon la own-property).
    const body = req.body ?? {};
    const gaProvided = Object.prototype.hasOwnProperty.call(body, "defaultGaId");
    const gaValue = gaProvided ? dto.defaultGaId ?? null : null;
    const statusProvided = Object.prototype.hasOwnProperty.call(body, "status");

    const before = await req.dbClient.query("SELECT status FROM tenants WHERE id = $1", [tenantId]);
    if (before.rowCount === 0) {
      throw new NotFoundException("Khong tim thay tenant.");
    }
    const fromStatus = before.rows[0].status;

    const { rows } = await req.dbClient.query(
      `UPDATE tenants SET
         default_ga_id = CASE WHEN $3::boolean THEN $2 ELSE default_ga_id END,
         status = CASE WHEN $5::boolean THEN $4 ELSE status END
       WHERE id = $1 RETURNING id, name, status, default_ga_id, created_at`,
      [tenantId, gaValue, gaProvided, dto.status ?? null, statusProvided]
    );
    if (statusProvided && dto.status && dto.status !== fromStatus) {
      // $2 (tenant_id, uuid) va $3 (resource_id, text) PHAI la 2 tham so rieng du cung
      // gia tri - dung chung 1 placeholder cho 2 cot khac kieu (uuid vs text) lam
      // Postgres suy luan kieu mau thuan ("inconsistent types deduced for parameter"),
      // phat hien qua test that (500 Internal Server Error) khi bam nut Suspend tren UI.
      await req.dbClient.query(
        `INSERT INTO audit_logs (actor_user_id, tenant_id, action, resource_id, metadata)
         VALUES ($1, $2, 'tenant_status_change', $3, $4::jsonb)`,
        [req.userId, tenantId, tenantId, JSON.stringify({ from: fromStatus, to: dto.status })]
      );
    }
    return rows[0];
  }

  @Post("memberships")
  async createMembership(@Req() req: AuthedRequest, @Body() dto: CreateMembershipDto) {
    assertAdmin(req);
    const { rows } = await req.dbClient.query(
      "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'creator') RETURNING id, tenant_id, user_id, role, status",
      [dto.tenantId, dto.userId]
    );
    return rows[0];
  }

  // F13-simplification: danh sach SACH DA DANG (khong con xem toan bo trang thai nhu
  // ban F13 dau tien) - day la bang chi tiet thay cho "Tenants" tren Admin dashboard,
  // dung de xem/sua/xoa tung sach da dang. Loc deleted_at IS NULL - sach da xoa mem
  // bien mat khoi day (van con nguyen trong DB, chi khong hien qua man hinh nao nua).
  // "views" la TONG luot xem trang TU TRUOC DEN NAY (khac opens_30d/page_views_30d cua
  // ban truoc, da bo cua so 30 ngay theo yeu cau don gian hoa).
  @Get("books")
  async listBooks(
    @Req() req: AuthedRequest,
    @Query("limit") limitQuery?: string,
    @Query("cursor") cursorQuery?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    assertAdmin(req);
    const limit = Math.min(100, Math.max(1, Number(limitQuery) || 20));
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
      throw new BadRequestException("Khoang ngay khong hop le.");
    }
    let cursorPublishedAt: string | null = null;
    let cursorId: string | null = null;
    if (cursorQuery) {
      try {
        const cursor = JSON.parse(Buffer.from(cursorQuery, "base64url").toString("utf8")) as { publishedAt?: string; id?: string };
        if (!cursor.publishedAt || !cursor.id || Number.isNaN(Date.parse(cursor.publishedAt)) || !/^[0-9a-f-]{36}$/i.test(cursor.id)) throw new Error("invalid");
        cursorPublishedAt = cursor.publishedAt;
        cursorId = cursor.id;
      } catch {
        throw new BadRequestException("Cursor phan trang khong hop le.");
      }
    }
    const commonWhere = `b.status = 'published' AND b.deleted_at IS NULL
      AND ($1::date IS NULL OR b.published_at >= $1::date)
      AND ($2::date IS NULL OR b.published_at < ($2::date + INTERVAL '1 day'))`;
    const { rows } = await req.dbClient.query(
      `SELECT b.id, b.title, b.tenant_id, b.owner_id, u.email AS owner_email, b.published_at,
        (SELECT COALESCE(SUM(ds.page_views), 0) FROM daily_stats ds WHERE ds.book_id = b.id) AS views
       FROM books b
       JOIN users u ON u.id = b.owner_id
       WHERE ${commonWhere}
         AND ($3::timestamptz IS NULL OR (b.published_at, b.id) < ($3::timestamptz, $4::uuid))
       ORDER BY b.published_at DESC NULLS LAST, b.id DESC
       LIMIT $5`,
      [from ?? null, to ?? null, cursorPublishedAt, cursorId, limit + 1]
    );
    const items = rows.slice(0, limit);
    const last = items.at(-1) as { published_at: string; id: string } | undefined;
    const nextCursor = rows.length > limit && last
      ? Buffer.from(JSON.stringify({ publishedAt: last.published_at, id: last.id })).toString("base64url")
      : null;
    const totalRes = await req.dbClient.query<{ total: string }>(`SELECT COUNT(*) AS total FROM books b WHERE ${commonWhere}`, [from ?? null, to ?? null]);
    return { items, total: Number(totalRes.rows[0].total), nextCursor };
  }

  // F13-simplification: XOA MEM 1 sach tu Admin (chua tung co endpoint xoa sach nao
  // truoc day, chi co unpublish/rollback) - da chot voi nguoi dung: chi dat deleted_at,
  // KHONG xoa dong trong DB, KHONG xoa file PDF/anh da luu (co the khoi phuc sau bang
  // tay qua DB neu can, khong co UI khoi phuc trong pham vi lan nay).
  @Delete("books/:id")
  async deleteBook(@Req() req: AuthedRequest, @Param("id") bookId: string) {
    assertAdmin(req);
    const { rows } = await req.dbClient.query(
      `UPDATE books SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id, title, tenant_id`,
      [bookId]
    );
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay sach, hoac sach da bi xoa truoc do.");
    }
    await req.dbClient.query(
      `INSERT INTO audit_logs (actor_user_id, tenant_id, action, resource_id, metadata)
       VALUES ($1, $2, 'book_soft_delete', $3, $4::jsonb)`,
      [req.userId, rows[0].tenant_id, bookId, JSON.stringify({ title: rows[0].title })]
    );
    return { ok: true };
  }

  // F13: hang doi job convert - mac dinh chi loi ("failed") vi day la thu Admin can
  // xu ly nhat; truyen state=all de xem het (queued/processing/done/failed).
  @Get("jobs")
  async listJobs(@Req() req: AuthedRequest, @Query("state") state?: string) {
    assertAdmin(req);
    const filterAll = state === "all";
    const filterState = filterAll ? null : JOB_STATES.includes(state as (typeof JOB_STATES)[number]) ? state : "failed";
    const { rows } = await req.dbClient.query(
      `SELECT j.id, j.state, j.attempts, j.progress, j.error, j.created_at, j.updated_at,
        j.book_id, b.title AS book_title, j.tenant_id, t.name AS tenant_name
       FROM jobs j
       JOIN books b ON b.id = j.book_id
       JOIN tenants t ON t.id = j.tenant_id
       WHERE ($1::text IS NULL OR j.state = $1)
       ORDER BY j.updated_at DESC
       LIMIT 200`,
      [filterState]
    );
    return rows;
  }

  // F13-simplification: nguoi dung yeu cau rut gon "Tong quan" tu 7 so xuong CHI CON 2 -
  // so sach da dang + tong luot mo (bo tenant/user/storage/failed-job/30-ngay, bo luon
  // "time on site" vi he thong chua do duoc, da chot qua AskUserQuestion).
  @Get("stats")
  async getStats(@Req() req: AuthedRequest) {
    assertAdmin(req);
    const { rows } = await req.dbClient.query(
      `SELECT
        (SELECT COUNT(*) FROM books WHERE status = 'published' AND deleted_at IS NULL) AS published_count,
        (SELECT COALESCE(SUM(opens), 0) FROM daily_stats) AS total_opens`
    );
    return rows[0];
  }

  // F13: xem audit log (hien chi co action 'view_private_book_as_admin' tu F16, va
  // 'tenant_status_change'/'user_status_change' moi them o dot nay - xem MEMORYBANK.md).
  @Get("audit-logs")
  async listAuditLogs(@Req() req: AuthedRequest, @Query("limit") limitQuery?: string) {
    assertAdmin(req);
    const limit = Math.min(500, Math.max(1, Number(limitQuery) || 100));
    const { rows } = await req.dbClient.query(
      `SELECT al.id, al.action, al.resource_id, al.occurred_at, al.metadata,
        al.actor_user_id, au.email AS actor_email,
        al.tenant_id, t.name AS tenant_name
       FROM audit_logs al
       LEFT JOIN users au ON au.id = al.actor_user_id
       LEFT JOIN tenants t ON t.id = al.tenant_id
       ORDER BY al.occurred_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }
}
