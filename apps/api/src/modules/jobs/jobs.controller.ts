import { Controller, Get, NotFoundException, Param, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { DbContextInterceptor } from "../../common/tenant/db-context.interceptor";
import { RequireTenant } from "../../common/tenant/require-tenant.decorator";
import { AuthedRequest } from "../../common/tenant/authed-request";

@Controller("jobs")
@UseGuards(JwtAuthGuard)
@UseInterceptors(DbContextInterceptor)
@RequireTenant()
export class JobsController {
  @Get(":id")
  async getOne(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { rows } = await req.dbClient.query(
      `SELECT id, book_id, revision_id, state, attempts, progress, error, created_at, updated_at
       FROM jobs WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      throw new NotFoundException("Khong tim thay job.");
    }
    return rows[0];
  }
}
