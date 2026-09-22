"use client";
import { useEffect, useState } from "react";
import { assetUrl } from "@/lib/api";
import { COOKIE_SESSION_TOKEN } from "@/lib/auth";

/** <img> khong the tu gan header Authorization/x-tenant-id, nen tai anh cua Creator
 * (chua chac da publish) qua fetch() roi doi thanh blob URL. Anh cong khai (public
 * reader) khong can cai nay - dung thang <img src> vao /public/books/... */
export function AuthImage({
  path,
  token,
  tenantId,
  alt,
  className,
  onClick,
}: {
  path: string;
  token: string;
  tenantId: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const headers: Record<string, string> = { "x-tenant-id": tenantId };
    if (token !== COOKIE_SESSION_TOKEN) headers.Authorization = `Bearer ${token}`;
    fetch(assetUrl(path), { headers, credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, token, tenantId]);

  if (!src) {
    return <div className={className} style={{ background: "#e2e8f0" }} onClick={onClick} />;
  }
  return <img src={src} alt={alt ?? ""} className={className} onClick={onClick} />;
}
