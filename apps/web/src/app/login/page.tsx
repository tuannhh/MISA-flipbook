"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { setToken, setTenantId } from "@/lib/auth";
import type { Me, Membership } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
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
      const activeMemberships = me.memberships.filter((m) => m.status === "active");
      if (activeMemberships.length === 0) {
        setError("Tai khoan nay chua thuoc tenant nao (khong co quyen Creator o bat ky don vi nao).");
        return;
      }
      if (activeMemberships.length === 1) {
        setTenantId(activeMemberships[0].tenantId);
        router.replace("/dashboard");
        return;
      }
      setMemberships(activeMemberships);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dang nhap that bai.");
    } finally {
      setLoading(false);
    }
  }

  function chooseTenant(tenantId: string) {
    setTenantId(tenantId);
    router.replace("/dashboard");
  }

  if (memberships) {
    return (
      <div className="page" style={{ maxWidth: 420, marginTop: 64 }}>
        <h1>Chon don vi (tenant)</h1>
        <p style={{ color: "var(--color-muted)" }}>Tai khoan cua ban thuoc nhieu don vi, chon 1 de tiep tuc.</p>
        {memberships.map((m) => (
          <button
            key={m.tenantId}
            className="btn secondary"
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: 8 }}
            onClick={() => chooseTenant(m.tenantId)}
          >
            {m.tenantName}
          </button>
        ))}
        <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => setMemberships(null)}>
          Quay lai
        </button>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 380, marginTop: 96 }}>
      <h1 style={{ marginBottom: 4 }}>MISA Flipbook</h1>
      <p style={{ color: "var(--color-muted)", marginTop: 0, marginBottom: 24 }}>Dang nhap Creator/Admin</p>
      {error && <div className="error-box">{error}</div>}
      <form onSubmit={handleLogin}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mat khau</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Dang dang nhap..." : "Dang nhap"}
        </button>
      </form>
    </div>
  );
}
