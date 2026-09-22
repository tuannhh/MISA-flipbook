"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { COOKIE_SESSION_TOKEN, clearSession, getTenantId, setIsAdmin, setTenantId } from "@/lib/auth";
import type { Me } from "@/lib/types";

/**
 * Browser Dashboard authentication is verified against the HttpOnly cookie by
 * `/me`; no Dashboard JWT is recovered from JavaScript storage. Tenant/admin
 * values are non-secret session UI state and the API still authorizes each call.
 */
export function useSession() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [isAdmin, setIsAdminState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiFetch<Me>("/me");
        const requestedTenantId = searchParams.get("tenantId");
        const activeMemberships = me.memberships.filter((membership) => membership.status === "active");
        const selectedTenantId = requestedTenantId ?? getTenantId() ?? (activeMemberships.length === 1 ? activeMemberships[0].tenantId : null);
        if (!selectedTenantId) {
          router.replace(me.isSystemAdmin ? "/admin" : "/login");
          return;
        }
        if (cancelled) return;
        setTenantId(selectedTenantId);
        setIsAdmin(me.isSystemAdmin);
        setTokenState(COOKIE_SESSION_TOKEN);
        setTenantIdState(selectedTenantId);
        setIsAdminState(me.isSystemAdmin);
        setReady(true);
      } catch {
        clearSession();
        router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  function logout() {
    void apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined).finally(() => {
      clearSession();
      router.replace("/login");
    });
  }

  return { ready, token, tenantId, isAdmin, logout };
}

/** System Admin pages need only the HttpOnly Dashboard cookie, not a tenant. */
export function useAdminSession() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<Me>("/me")
      .then((me) => {
        if (cancelled) return;
        if (!me.isSystemAdmin) {
          router.replace("/dashboard");
          return;
        }
        setIsAdmin(true);
        setTokenState(COOKIE_SESSION_TOKEN);
        setReady(true);
      })
      .catch(() => {
        clearSession();
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  function logout() {
    void apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined).finally(() => {
      clearSession();
      router.replace("/login");
    });
  }

  return { ready, token, logout };
}