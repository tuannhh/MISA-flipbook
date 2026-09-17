"use client";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/useSession";
import { apiFetch, ApiError } from "@/lib/api";
import { AuthImage } from "@/components/AuthImage";
import type { Book, BookSettings, JobStatus, PreviewResult, Revision } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { MobileTopBar } from "@/components/MobileTopBar";
import { MobileHeaderActions } from "@/components/MobileHeaderActions";
import { XButton } from "@/components/xds/XButton";
import { XInput } from "@/components/xds/XInput";
import { XSwitch } from "@/components/xds/XSwitch";
import { XTag, type XTagColor } from "@/components/xds/XTag";
import { XDialog } from "@/components/xds/XDialog";
import { XIcon } from "@/components/xds/icons/XIcon";
import { useToast } from "@/components/xds/XToast";

type BookWithCover = Book & { cover_asset_id: string | null };

const JOB_POLL_MS = 1500;

// F09: iframe responsive, khong co kich thuoc co dinh - xem chu thich goc cua
// ham nay truoc khi sua (giu nguyen logic tu P3, chi doi UI xung quanh).
function embedCode(publicPath: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const src = `${origin}${publicPath}/embed`;
  return `<iframe src="${src}" style="width:100%;max-width:900px;aspect-ratio:4/3;border:0" allowfullscreen loading="lazy"></iframe>`;
}

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, token, tenantId, logout } = useSession();
  const t = useTranslations("bookDetail");
  const tc = useTranslations("common");
  const toast = useToast();
  const [book, setBook] = useState<BookWithCover | null>(null);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [settings, setSettings] = useState<BookSettings | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [publishTarget, setPublishTarget] = useState<string | null>(null);
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
      toast("error", err instanceof ApiError ? err.message : t("errorLoad"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast("error", err instanceof ApiError ? err.message : t("errorUpload"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadPreview(revisionId: string) {
    if (!token || !tenantId) return;
    setPreviewLoading(revisionId);
    try {
      const result = await apiFetch<PreviewResult>(`/books/${id}/preview?revisionId=${revisionId}`, { token, tenantId });
      setPreview(result);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorPreview"));
    } finally {
      setPreviewLoading(null);
    }
  }

  async function confirmPublish() {
    if (!token || !tenantId || !publishTarget) return;
    try {
      const updated = await apiFetch<BookWithCover>(`/books/${id}/publish`, {
        method: "POST",
        token,
        tenantId,
        body: { revisionId: publishTarget },
      });
      setBook(updated);
      toast("success", t("noticePublished"));
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorPublish"));
    } finally {
      setPublishTarget(null);
    }
  }

  async function handleSaveTitle() {
    if (!token || !tenantId || !titleDraft.trim() || titleDraft === book?.title) return;
    try {
      const updated = await apiFetch<BookWithCover>(`/books/${id}`, { method: "PATCH", token, tenantId, body: { title: titleDraft.trim() } });
      setBook(updated);
      toast("success", t("noticeTitleSaved"));
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorSaveTitle"));
    }
  }

  async function toggleAllowDownload(next: boolean) {
    if (!token || !tenantId || !settings) return;
    try {
      const updated = await apiFetch<BookSettings>(`/books/${id}/settings`, { method: "PUT", token, tenantId, body: { allowDownload: next } });
      setSettings(updated);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorSettings"));
    }
  }

  async function savePassword() {
    if (!token || !tenantId || !passwordDraft.trim()) return;
    setPasswordBusy(true);
    try {
      const updated = await apiFetch<BookSettings>(`/books/${id}/settings`, { method: "PUT", token, tenantId, body: { password: passwordDraft.trim() } });
      setSettings(updated);
      setPasswordDraft("");
      toast("success", t("noticePasswordSet"));
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorSetPassword"));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function clearPassword() {
    if (!token || !tenantId) return;
    setPasswordBusy(true);
    try {
      const updated = await apiFetch<BookSettings>(`/books/${id}/settings`, { method: "PUT", token, tenantId, body: { removePassword: true } });
      setSettings(updated);
      toast("success", t("noticePasswordRemoved"));
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorRemovePassword"));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function copyEmbedCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast("success", tc("copied"));
    } catch {
      toast("error", tc("copyFailed"));
    }
  }

  async function chooseCover(thumbAssetId: string) {
    if (!token || !tenantId) return;
    try {
      const updated = await apiFetch<BookSettings>(`/books/${id}/settings`, { method: "PUT", token, tenantId, body: { thumbnailAssetId: thumbAssetId } });
      setSettings(updated);
      toast("success", t("noticeCoverChosen"));
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorChooseCover"));
    }
  }

  if (!ready || !book) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-[var(--xds-text-secondary)]">{tc("loading")}</div>;
  }

  const publicUrl = book.status === "published" ? `/read/${book.permalink_slug}-${book.permalink_suffix}` : null;
  const STATUS_COLOR: Record<Book["status"], XTagColor> = { draft: "neutral", converting: "warning", ready: "info", published: "success", error: "danger" };

  const publishDialog = (
    <XDialog
      open={publishTarget !== null}
      onOpenChange={(v) => !v && setPublishTarget(null)}
      title={t("confirmPublishTitle")}
      type="confirm"
      confirmText={t("publish")}
      onConfirm={confirmPublish}
    >
      {t("confirmPublishDesc")}
    </XDialog>
  );

  const titleCard = (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <label className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">{t("titleLabel")}</label>
      <div className="flex gap-2">
        <XInput value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} containerClassName="flex-1" />
        <XButton variant="neutral" onClick={handleSaveTitle} disabled={titleDraft === book.title}>
          {tc("save")}
        </XButton>
      </div>
      <p className="mt-3 text-[13px] text-[var(--xds-text-secondary)]">
        {t("statusLabel")}: <XTag color={STATUS_COLOR[book.status]}>{book.status}</XTag>
      </p>
      {publicUrl && (
        <p className="mt-2 truncate text-[13px]">
          {t("publicLinkLabel")}:{" "}
          <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[var(--xds-brand-600)] hover:underline">
            {typeof window !== "undefined" ? window.location.origin : ""}
            {publicUrl}
          </a>
        </p>
      )}
    </div>
  );

  const uploadCard = (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("uploadTitle")}</h2>
      <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} disabled={uploading} className="text-[13px]" />
      {uploading && <p className="mt-2 text-[13px] text-[var(--xds-text-secondary)]">{t("uploading")}</p>}
      {activeJob && (
        <p className="mt-2 text-[13px] text-[var(--xds-text-secondary)]">
          {t("jobLabel")} {activeJob.id.slice(0, 8)}: <strong>{activeJob.state}</strong>
          {activeJob.state === "failed" && activeJob.error ? ` - ${activeJob.error}` : ""}
        </p>
      )}
    </div>
  );

  const settingsCard = (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("settingsTitle")}</h2>
      <XSwitch checked={settings?.allow_download ?? false} onChange={toggleAllowDownload} label={t("allowDownloadLabel")} />

      <div className="mt-5 border-t border-[var(--xds-border-light)] pt-4">
        <label className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">{t("passwordSectionTitle")}</label>
        <p className="mb-2 text-[13px] text-[var(--xds-text-secondary)]">{settings?.has_password ? t("passwordHasNote") : t("passwordNoneNote")}</p>
        <div className="flex flex-wrap gap-2">
          <XInput
            type="password"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            containerClassName="flex-1 min-w-[200px]"
          />
          <XButton variant="neutral" onClick={savePassword} loading={passwordBusy} disabled={passwordDraft.trim().length < 4}>
            {settings?.has_password ? t("changePassword") : t("setPassword")}
          </XButton>
          {settings?.has_password && (
            <XButton variant="danger" onClick={clearPassword} loading={passwordBusy}>
              {t("removePassword")}
            </XButton>
          )}
        </div>
      </div>
    </div>
  );

  const shareCard = publicUrl && (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <h2 className="mb-2 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("shareEmbedTitle")}</h2>
      <p className="mb-2 text-[13px] text-[var(--xds-text-secondary)]">{t("shareEmbedHint")}</p>
      <textarea
        readOnly
        value={embedCode(publicUrl)}
        onFocus={(e) => e.currentTarget.select()}
        rows={3}
        className="w-full rounded-lg border border-[var(--xds-border)] bg-[var(--xds-bg)] p-2.5 font-mono text-[12px] text-[var(--xds-text)]"
      />
      <XButton variant="neutral" className="mt-2" icon={<XIcon name="copy" />} onClick={() => copyEmbedCode(embedCode(publicUrl))}>
        {t("copyEmbedCode")}
      </XButton>
    </div>
  );

  const revisionsCard = (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("revisionsTitle")}</h2>
      {revisions === null && <p className="text-[13px] text-[var(--xds-text-secondary)]">{tc("loading")}</p>}
      {revisions?.length === 0 && <p className="text-[13px] text-[var(--xds-text-secondary)]">{t("noRevisions")}</p>}
      {revisions && revisions.length > 0 && (
        <div className="flex flex-col">
          {revisions.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-t border-[var(--xds-border-light)] py-2 text-[13px] first:border-t-0">
              <span>#{r.revision_number}</span>
              <span className="text-[var(--xds-text-secondary)]">{r.state}</span>
              <span className="flex gap-2">
                {r.state === "ready" && (
                  <>
                    <XButton variant="neutral" size="md" loading={previewLoading === r.id} onClick={() => loadPreview(r.id)}>
                      {previewLoading === r.id ? t("previewing") : t("preview")}
                    </XButton>
                    <XButton variant="primary" disabled={book.published_revision_id === r.id} onClick={() => setPublishTarget(r.id)}>
                      {book.published_revision_id === r.id ? t("publishing") : t("publish")}
                    </XButton>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const latestRevision = revisions?.[0] ?? null;
  const previewCard = preview && (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <h2 className="mb-1 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">
        {t("previewSectionTitle", { number: preview.revisionNumber, count: preview.pages.length })}
      </h2>
      <p className="mb-2 text-[13px] text-[var(--xds-text-secondary)]">{t("previewHint")}</p>
      <div className="flex gap-2 overflow-x-auto py-2">
        {preview.pages.map((p) =>
          p.thumbAssetId ? (
            <AuthImage
              key={p.page}
              path={`/books/${id}/assets/${p.thumbAssetId}`}
              token={token!}
              tenantId={tenantId!}
              alt={`Trang ${p.page}`}
              className="h-[90px] shrink-0 cursor-pointer rounded border border-[var(--xds-border)]"
              onClick={() => chooseCover(p.thumbAssetId!)}
            />
          ) : null
        )}
      </div>
    </div>
  );

  const previewSuggestion = latestRevision && !preview && latestRevision.state === "ready" && (
    <p className="text-[13px] text-[var(--xds-text-secondary)]">{t("previewSuggestion")}</p>
  );

  return (
    <>
      {/* ===== Desktop ===== */}
      <div className="hidden min-h-dvh flex-col md:flex">
        <AppHeader onLogout={logout} />
        <div className="flex-1 bg-[var(--xds-bg-page)] p-4">
          <div className="mx-auto flex max-w-[720px] flex-col gap-4">
            <Link href="/dashboard" className="text-[13px] text-[var(--xds-brand-600)] hover:underline">
              ← {t("backToList")}
            </Link>
            {titleCard}
            {uploadCard}
            {settingsCard}
            {shareCard}
            {revisionsCard}
            {previewCard}
            {previewSuggestion}
          </div>
        </div>
      </div>

      {/* ===== Mobile ===== */}
      <div className="xds-mobile-app flex min-h-dvh flex-col md:hidden">
        <MobileTopBar title={book.title} onBack={() => router.push("/dashboard")} actions={<MobileHeaderActions onLogout={logout} />} />
        <div className="flex-1 overflow-y-auto bg-[var(--xds-bg-page)] xds-mobile-gutter-x py-4">
          <div className="flex flex-col gap-3">
            {titleCard}
            {uploadCard}
            {settingsCard}
            {shareCard}
            {revisionsCard}
            {previewCard}
            {previewSuggestion}
          </div>
        </div>
      </div>

      {publishDialog}
    </>
  );
}
