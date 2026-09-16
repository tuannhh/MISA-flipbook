import { Controller, Get, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../common/db/db.tokens";

@Controller("health")
export class HealthController {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  @Get()
  async check() {
    await this.pool.query("SELECT 1");
    return { status: "ok" };
  }
}
