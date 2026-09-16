import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { Pool } from "pg";
import { DB_POOL } from "../../common/db/db.tokens";

interface AuthLookupRow {
  id: string;
  password_hash: string;
  is_system_admin: boolean;
  status: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly jwtService: JwtService
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    // auth_lookup_user_by_email la SECURITY DEFINER, khong can transaction/context
    // tenant - xem infra/migrations/0004_auth_lookup_function.sql.
    const { rows } = await this.pool.query<AuthLookupRow>(
      "SELECT * FROM auth_lookup_user_by_email($1)",
      [email]
    );
    const invalidCredentials = () =>
      new UnauthorizedException("Email hoac mat khau khong dung.");

    if (rows.length === 0) {
      // Van chay verify voi mot hash gia de tranh timing attack tiet lo email ton tai hay khong.
      await argon2.verify(DUMMY_HASH, password).catch(() => undefined);
      throw invalidCredentials();
    }
    const user = rows[0];
    if (user.status !== "active") {
      throw invalidCredentials();
    }
    const ok = await argon2.verify(user.password_hash, password).catch(() => false);
    if (!ok) {
      throw invalidCredentials();
    }

    const accessToken = await this.jwtService.signAsync({ sub: user.id, email });
    return { accessToken };
  }
}

// Hash argon2id HOP LE that (sinh 1 lan bang `argon2.hash`), dung rieng de lam phep
// so sanh gia khi khong tim thay user - giu chi phi tinh toan giong het truong hop
// that de khong lo qua timing liệu email co ton tai hay khong.
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$he+FVd6myk5j2awxNiKYlQ$tCG3ohaoKnbHJ+VCWejGSXo0YRZqmwxVv4l0tsrQhtk";
