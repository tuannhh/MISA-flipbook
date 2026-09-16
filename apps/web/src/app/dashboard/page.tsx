"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import type { Book } from "@/lib/types";

type BookWithCover = Book & { cover_asset_id: string | null };

const STATUS_LABEL: Record<Book["status"], string> = {
  draft: "Nhap",
  converting: "Dang xu ly",
  ready: "San sang",
  published: "Da xuat ban",
  error: "Loi",
};

export default function DashboardPage() {
  const { ready, token, tenantId, logout } = useSession();
  const [books, setBooks] = useState<BookWithCover[] | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadBooks() {
    if (!token || !tenantId) return;
    try {
      const rows = await apiFetch<BookWithCover[]>("/books", { token, tenantId });
      setBooks(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Khong tai duoc danh sach sach.");
    }
  }

  useEffect(() => {
    if (ready) void loadBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !tenantId || !title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await apiFetch<Book>("/books", { method: "POST", token, tenantId, body: { title: title.trim() } });
      setTitle("");
      await loadBooks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tao sach that bai.");
    } finally {
      setCreating(false);
    }
  }

  if (!ready) return null;

  return (
    <>
      <div className="topbar">
        <Link href="/dashboard">MISA Flipbook</Link>
        <div className="actions">
          <button className="btn secondary" onClick={logout}>
            Dang xuat
          </button>
        </div>
      </div>
      <div className="page">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Tao sach moi</h2>
          {error && <div className="error-box">{error}</div>}
          <form onSubmit={handleCreate} style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Tieu de sach..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10 }}
            />
            <button className="btn" type="submit" disabled={creating || !title.trim()}>
              {creating ? "Dang tao..." : "Tao sach"}
            </button>
          </form>
        </div>

        <h2>Sach cua ban</h2>
        {books === null && <p>Dang tai...</p>}
        {books !== null && books.length === 0 && <p style={{ color: "var(--color-muted)" }}>Chua co sach nao.</p>}
        <div className="book-list">
          {books?.map((b) => (
            <Link key={b.id} href={`/dashboard/books/${b.id}`} className="book-tile">
              <div className="thumb">
                {b.status === "published" && b.cover_asset_id ? (
                  <img
                    src={assetUrl(`/public/books/${b.permalink_slug}-${b.permalink_suffix}/assets/${b.cover_asset_id}`)}
                    alt=""
                  />
                ) : (
                  <span>Chua co anh</span>
                )}
              </div>
              <div className="meta">
                <div className="title">{b.title}</div>
                <span className={`badge ${b.status === "published" ? "published" : b.status === "error" ? "error" : "draft"}`}>
                  {STATUS_LABEL[b.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
