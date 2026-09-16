import { Body, Controller, Post, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import * as argon2 from "argon2";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { DbContextInterceptor } from "../../common/tenant/db-context.interceptor";
import { AuthedRequest } from "../../common/tenant/authed-request";
import { assertAdmin } from "../../common/tenant/assert-admin";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateMembershipDto } from "./dto/create-membership.dto";

// Tat ca route o day chi Admin (system admin) dung - PLAN.md muc 3: "Quan ly
// user/tenant/cau hinh he thong: chi Admin". Khong co dang ky cong khai (khoan 7).
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

  @Post("memberships")
  async createMembership(@Req() req: AuthedRequest, @Body() dto: CreateMembershipDto) {
    assertAdmin(req);
    const { rows } = await req.dbClient.query(
      "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'creator') RETURNING id, tenant_id, user_id, role, status",
      [dto.tenantId, dto.userId]
    );
    return rows[0];
  }
}
