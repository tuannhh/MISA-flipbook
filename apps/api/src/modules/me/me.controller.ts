import { Controller, Get, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { DbContextInterceptor } from "../../common/tenant/db-context.interceptor";
import { AuthedRequest } from "../../common/tenant/authed-request";

@Controller("me")
@UseGuards(JwtAuthGuard)
@UseInterceptors(DbContextInterceptor)
export class MeController {
  @Get()
  async me(@Req() req: AuthedRequest) {
    const userRes = await req.dbClient.query(
      "SELECT id, email, is_system_admin FROM users WHERE id = $1",
      [req.userId]
    );
    const membershipsRes = await req.dbClient.query(
      `SELECT m.tenant_id, t.name AS tenant_name, m.role, m.status
       FROM memberships m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1`,
      [req.userId]
    );
    return {
      id: userRes.rows[0].id,
      email: userRes.rows[0].email,
      isSystemAdmin: userRes.rows[0].is_system_admin,
      memberships: membershipsRes.rows.map((r: { tenant_id: string; tenant_name: string; role: string; status: string }) => ({
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        role: r.role,
        status: r.status,
      })),
    };
  }
}
