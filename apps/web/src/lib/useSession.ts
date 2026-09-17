"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getToken, getTenantId, getIsAdmin, clearSession } from "@/lib/auth";

/** Bao ve trang can dang nhap: chuyen ve /login neu chua co token/tenant.
 * FE la SPA thuan tuy, khong co middleware SSR kiem tra session (token nam o
 * localStorage cua trinh duyet, BE khong biet gi ve no ngoai viec xac thuc JWT).
 *
 * F13-simplification: cho phep override tenantId qua query param `?tenantId=` - dung
 * khi Admin (co the KHONG thuoc tenant nao, khong co gi trong localStorage) mo trang
 * chi tiet 1 sach tu danh sach Admin de "Xem/Sua". AN TOAN vi BE (DbContextInterceptor)
 * van tu kiem tra: nguoi khong phai Admin gui tenantId khong phai cua minh se bi 403
 * (khong co membership active) - override nay chi la tien ich UI, khong phai lop bao ve. */
export function useSession() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [isAdmin, setIsAdminState] = useState(false);

  useEffect(() => {
    const t = getToken();
    const tid = searchParams.get("tenantId") || getTenantId();
    if (!t || !tid) {
      router.replace("/login");
      return;
    }
    setTokenState(t);
    setTenantIdState(tid);
    setIsAdminState(getIsAdmin());
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return { ready, token, tenantId, isAdmin, logout };
}

/** F13: bao ve man hinh /admin/* - CHI can token (Admin he thong co the khong
 * thuoc tenant nao). isAdmin o day chi la tien ich UI; moi API /admin/* van tu
 * assertAdmin() lai o BE, khong tin co ban cache client. */
export function useAdminSession() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setTokenState(t);
    setReady(true);
  }, [router]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return { ready, token, logout };
}
