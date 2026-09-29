import { BlockList, isIP } from "net";
import type { NextFunction, Request, Response } from "express";

/**
 * Phong thu nhieu tang cho yeu cau an ninh MISA: BE chua duoc kiem tra an ninh nen moi
 * duong KHONG cong khai chi nhan tu IP MISA (MISA_ALLOWED_CIDRS). Nginx chan truoc, day la
 * lop thu hai: neu nginx cau hinh sai hoac API bi lo truc tiep, guard van chan.
 *
 * Public (khong can IP MISA): /public/** (doc sach da publish) va /health.
 * Moi thu khac (auth, books, admin, jobs, me, upload...) => 403 neu IP ngoai danh sach.
 * FAIL-CLOSED: khong khai bao MISA_ALLOWED_CIDRS => API khong khoi dong.
 */
export function buildAllowList(raw: string | undefined): BlockList {
  const list = new BlockList();
  const items = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) {
    throw new Error("Thieu MISA_ALLOWED_CIDRS: BE tu choi khoi dong (fail-closed) cho den khi khai bao IP MISA.");
  }
  for (const item of items) {
    const [addr, prefixRaw] = item.split("/");
    const family = isIP(addr);
    if (!family) throw new Error(`MISA_ALLOWED_CIDRS chua gia tri khong hop le: ${item}`);
    const max = family === 4 ? 32 : 128;
    if (prefixRaw === undefined) {
      list.addAddress(addr, family === 4 ? "ipv4" : "ipv6");
      continue;
    }
    const prefix = Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) {
      throw new Error(`MISA_ALLOWED_CIDRS co prefix khong hop le: ${item}`);
    }
    list.addSubnet(addr, prefix, family === 4 ? "ipv4" : "ipv6");
  }
  return list;
}

function normalizeIp(ip: string | undefined): string {
  if (!ip) return "";
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) -> IPv4 de so khop CIDR IPv4.
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export function isPublicPlanePath(path: string): boolean {
  return path === "/health" || path === "/public" || path.startsWith("/public/");
}

export function networkPlaneMiddleware(allow: BlockList) {
  return (req: Request, res: Response, next: NextFunction) => {
    // OPTIONS preflight van phai qua CORS layer cho duong public.
    if (isPublicPlanePath(req.path)) return next();
    const ip = normalizeIp(req.ip);
    const family = isIP(ip);
    if (family && allow.check(ip, family === 4 ? "ipv4" : "ipv6")) return next();
    res.status(403).json({ statusCode: 403, message: "Truy cap bi tu choi: chi cho phep tu mang MISA." });
  };
}
