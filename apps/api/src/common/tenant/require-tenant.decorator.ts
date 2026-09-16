import { SetMetadata } from "@nestjs/common";

export const REQUIRE_TENANT_KEY = "requireTenant";

// Danh dau route can header x-tenant-id + membership hop le (Creator).
// Route Admin (vd /admin/*) KHONG dung decorator nay - admin bypass RLS
// qua co is_system_admin, khong can chon tenant.
export const RequireTenant = () => SetMetadata(REQUIRE_TENANT_KEY, true);
