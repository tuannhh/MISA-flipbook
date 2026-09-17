"use client";
import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api";
import { setToken, setTenantId, setIsAdmin } from "@/lib/auth";
import type { Me, Membership } from "@/lib/types";
import { XInput } from "@/components/xds/XInput";
import { XButton } from "@/components/xds/XButton";

// Man hinh chua dang nhap - khong co XHeaderBar (khong co gi de dieu huong).
// Van tach 2 cay DOM desktop/mobile (an qua Tailwind hidden/md:hidden) de dung
// dung .xds-mobile-app tren mobile (touch target 48px, input khong bi iOS
// zoom - dinh nghia san trong tokens.css), thay vi responsive co giao 1 layout.
function Shell({ mobile, children }: { mobile: boolean; children: ReactNode }) {
  return (
    <div
      className={
        mobile
          ? "xds-mobile-app flex min-h-dvh md:hidden items-center justify-center px-4"
          : "hidden min-h-dvh md:flex items-center justify-center px-4"
      }
    >
      <div className="w-full max-w-[380px] rounded-lg bg-[var(--xds-bg)] p-6 shadow-[var(--xds-shadow-card)]">
        {children}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken } = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(accessToken);
      const me = await apiFetch<Me>("/me", { token: accessToken });
      setIsAdmin(me.isSystemAdmin);
      const activeMemberships = me.memberships.filter((m) => m.status === "active");
      if (activeMemberships.length === 0) {
        // F13: Admin he thong co the khong thuoc tenant nao ca (tai khoan quan tri
        // thuan tuy) - vao thang /admin thay vi bao loi "khong co tenant".
        if (me.isSystemAdmin) {
          router.replace("/admin");
          return;
        }
        setError(t("errorNoTenant"));
        return;
      }
      if (activeMemberships.length === 1) {
        setTenantId(activeMemberships[0].tenantId);
        router.replace("/dashboard");
        return;
      }
      setMemberships(activeMemberships);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  function chooseTenant(tenantId: string) {
    setTenantId(tenantId);
    router.replace("/dashboard");
  }

  const logo = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/misa-logo.jpg" alt="MISA" className="mx-auto mb-4 h-10 w-auto object-contain" />
  );

  const tenantChooser = memberships && (
    <>
      {logo}
      <h1 className="mb-1 text-[20px] font-semibold leading-7 text-[var(--xds-text)]">{t("chooseTenantTitle")}</h1>
      <p className="mb-4 text-[13px] text-[var(--xds-text-secondary)]">{t("chooseTenantSubtitle")}</p>
      <div className="flex flex-col gap-2">
        {memberships.map((m) => (
          <XButton key={m.tenantId} variant="neutral" className="w-full justify-start" onClick={() => chooseTenant(m.tenantId)}>
            {m.tenantName}
          </XButton>
        ))}
      </div>
      <XButton variant="ghost" className="mt-3 w-full" onClick={() => setMemberships(null)}>
        {t("back")}
      </XButton>
    </>
  );

  const loginForm = (
    <>
      {logo}
      <h1 className="mb-1 text-[20px] font-semibold leading-7 text-[var(--xds-text)]">{t("title")}</h1>
      <p className="mb-6 text-[13px] text-[var(--xds-text-secondary)]">{t("subtitle")}</p>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--xds-danger)] bg-[var(--xds-danger-soft)] px-3 py-2 text-[13px] text-[var(--xds-danger)]">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">
            {t("emailLabel")}
          </label>
          <XInput id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">
            {t("passwordLabel")}
          </label>
          <XInput
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <XButton variant="primary" type="submit" size="lg" loading={loading} className="w-full">
          {loading ? t("submitting") : t("submit")}
        </XButton>
      </form>
    </>
  );

  const content = memberships ? tenantChooser : loginForm;

  return (
    <>
      <Shell mobile={false}>{content}</Shell>
      <Shell mobile>{content}</Shell>
    </>
  );
}
