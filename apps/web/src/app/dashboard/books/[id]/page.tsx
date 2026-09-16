"use client";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { apiFetch, ApiError } from "@/lib/api";
import { AuthImage } from "@/components/AuthImage";
import type { Book, BookSettings, JobStatus, PreviewResult, Revision } from "@/lib/types";

type BookWithCover = Book & { cover_asset_id: string | null };

const JOB_POLL_MS = 1500;

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, token, tenantId } = useSession();
  const [book, setBook] = useState<BookWithCover | null>(null);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [settings, setSettings] = useState<BookSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!token || !tenantId) return;
    try {
      const b = await apiFetch<BookWithCover>(`/books/${id}`, { token, tenantId });
      setBook(b);
      setTitleDraft(b.title);
      const revs = await apiFetch<Revision[]>(`/books/${id}/revisions`, { token, tenantId });
      setRevisions(revs);
      const s = await apiFetch<BookSettings>(`/books/${id}/settings`, { token, tenantId });
      setSettings(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Khong tai duoc thong tin sach.");
    }
  }, [id, token, tenantId]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function pollJob(jobId: string) {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      if (!token || !tenantId) return;
      try {
        const job = await apiFetch<JobStatus>(`/jobs/${jobId}`, { token, tenantId });
        setActiveJob(job);
        if (job.state === "done" || job.state === "failed") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          await load();
        }
      } catch {
        if (pollTimer.current) clearInterval(pollTimer.current);
      }
    }, JOB_POLL_MS);
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token || !tenantId) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ jobId: string; jobState: string }>(`/books/${id}/upload`, {
        method: "POST",
        token,
        tenantId,
        body: form,
        isForm: true,
      });
      setActiveJob({
        id: res.jobId,
        book_id: id,
        revision_id: "",
        state: res.jobState as JobStatus["state"],
        attempts: 0,
        progress: 0,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      pollJob(res.jobId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload that bai.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadPreview(revisionId: string) {
    if (!token || !tenantId) return;
    setPreviewLoading(revisionId);
    setError(null);
    try {
      const result = await apiFetch<PreviewResult>(`/books/${id}/preview?revisionId=${revisionId}`, {
        token,
        tenantId,
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Khong xem truoc duoc revision nay.");
    } finally {
      setPreviewLoading(null);
    }
  }

  async function handlePublish(revisionId: string) {
    if (!token || !tenantId) return;
    setError(null);
    try {
      const updated = await apiFetch<BookWithCover>(`/books/${id}/publish`, {
        method: "POST",
        token,
        tenantId,
        body: { revisionId },
      });
      setBook(updated);
      setNotice("Da xuat ban thanh cong.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publish that bai.");
    }
  }

  async function handleSaveTitle() {
    if (!token || !tenantId || !titleDraft.trim() || titleDraft === book?.title) return;
    try {
      const updated = await apiFetch<BookWithCover>(`/books/${id}`, {
        method: "PATCH",
        token,
        tenantId,
        body: { title: titleDraft.trim() },
      });
      setBook(updated);
      setNotice("Da luu tieu de.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Luu tieu de that bai.");
    }
  }

  async function toggleAllowDownload() {
    if (!token || !tenantId || !settings) return;
    try {
      const updated = await apiFetch<BookSettings>(`/books/${id}/settings`, {
        method: "PUT",
        token,
        tenantId,
        body: { allowDownload: !settings.allow_download },
      });
      setSettings(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Cap nhat cai dat that bai.");
    }
  }

  async function chooseCover(thumbAssetId: string) {
    if (!token || !tenantId) return;
    try {
      const updated = await apiFetch<BookSettings>(`/books/${id}/settings`, {
        method: "PUT",
        token,
        tenantId,
        body: { thumbnailAssetId: thumbAssetId },
      });
      setSettings(updated);
      setNotice("Da chon anh bia.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Chon anh bia that bai.");
    }
  }

  if (!ready || !book) {
    return (
      <div className="page">
        {error && <div className="error-box">{error}</div>}
        <p>Dang tai...</p>
      </div>
    );
  }

  const publicUrl = book.status === "published" ? `/read/${book.permalink_slug}-${book.permalink_suffix}` : null;
  const latestRevision = revisions?.[0] ?? null;

  return (
    <>
      <div className="topbar">
        <Link href="/dashboard">MISA Flipbook</Link>
      </div>
      <div className="page">
        <p>
          <Link href="/dashboard">&larr; Danh sach sach</Link>
        </p>
        {error && <div className="error-box">{error}</div>}
        {notice && (
          <div className="card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "var(--color-success)" }}>
            {notice}
          </div>
        )}

        <div className="card">
          <div className="field">
            <label>Tieu de</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10 }}
              />
              <button className="btn secondary" onClick={handleSaveTitle} disabled={titleDraft === book.title}>
                Luu
              </button>
            </div>
          </div>
          <p>
            Trang thai: <span className={`badge ${book.status === "published" ? "published" : "draft"}`}>{book.status}</span>
          </p>
          {publicUrl && (
            <p>
              Link cong khai:{" "}
              <a href={publicUrl} target="_blank" rel="noreferrer">
                {typeof window !== "undefined" ? window.location.origin : ""}
                {publicUrl}
              </a>
            </p>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Upload PDF (tao revision moi)</h2>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} disabled={uploading} />
          {uploading && <p>Dang upload...</p>}
          {activeJob && (
            <p>
              Job {activeJob.id.slice(0, 8)}: trang thai <strong>{activeJob.state}</strong>
              {activeJob.state === "failed" && activeJob.error ? ` - ${activeJob.error}` : ""}
            </p>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Cai dat</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={settings?.allow_download ?? false} onChange={toggleAllowDownload} />
            Cho phep tai xuong PDF goc
          </label>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Revisions</h2>
          {revisions === null && <p>Dang tai...</p>}
          {revisions?.length === 0 && <p style={{ color: "var(--color-muted)" }}>Chua co revision nao, hay upload PDF.</p>}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {revisions?.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 4px" }}>#{r.revision_number}</td>
                  <td style={{ padding: "8px 4px" }}>{r.state}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }}>
                    {r.state === "ready" && (
                      <>
                        <button className="btn secondary" onClick={() => loadPreview(r.id)} disabled={previewLoading === r.id} style={{ marginRight: 8 }}>
                          {previewLoading === r.id ? "Dang tai..." : "Xem truoc"}
                        </button>
                        <button
                          className="btn"
                          onClick={() => handlePublish(r.id)}
                          disabled={book.published_revision_id === r.id}
                        >
                          {book.published_revision_id === r.id ? "Dang publish" : "Publish"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {preview && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>
              Xem truoc revision #{preview.revisionNumber} ({preview.pages.length} trang)
            </h2>
            <p style={{ color: "var(--color-muted)", fontSize: 13 }}>Bam vao 1 anh de chon lam anh bia.</p>
            <div className="thumb-strip">
              {preview.pages.map((p) =>
                p.thumbAssetId ? (
                  <AuthImage
                    key={p.page}
                    path={`/books/${id}/assets/${p.thumbAssetId}`}
                    token={token!}
                    tenantId={tenantId!}
                    alt={`Trang ${p.page}`}
                    className="thumb-strip-img"
                    onClick={() => chooseCover(p.thumbAssetId!)}
                  />
                ) : null
              )}
            </div>
          </div>
        )}

        {latestRevision && !preview && latestRevision.state === "ready" && (
          <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
            Goi y: bam &quot;Xem truoc&quot; o revision moi nhat truoc khi publish.
          </p>
        )}
      </div>
    </>
  );
}
