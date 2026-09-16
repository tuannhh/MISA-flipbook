"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getTenantId, clearSession } from "@/lib/auth";

/** Bao ve trang can dang nhap: chuyen ve /login neu chua co token/tenant.
 * FE la SPA thuan tuy, khong co middleware SSR kiem tra session (token nam o
 * localStorage cua trinh duyet, BE khong biet gi ve no ngoai viec xac thuc JWT). */
export function useSession() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [tenantId, setTenantIdState] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    const tid = getTenantId();
    if (!t || !tid) {
      router.replace("/login");
      return;
    }
    setTokenState(t);
    setTenantIdState(tid);
    setReady(true);
  }, [router]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return { ready, token, tenantId, logout };
}
