"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/useSession";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import type { Book } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { MobileTopBar } from "@/components/MobileTopBar";
import { MobileHeaderActions } from "@/components/MobileHeaderActions";
import { XButton } from "@/components/xds/XButton";
import { XInput } from "@/components/xds/XInput";
import { XDialog } from "@/components/xds/XDialog";
import { XTag, type XTagColor } from "@/components/xds/XTag";
import { XEmptyState } from "@/components/xds/XEmptyState";
import { XIcon } from "@/components/xds/icons/XIcon";
import { useToast } from "@/components/xds/XToast";

type BookWithCover = Book & { cover_asset_id: string | null };

const STATUS_COLOR: Record<Book["status"], XTagColor> = {
  draft: "neutral",
  converting: "warning",
  ready: "info",
  published: "success",
  error: "danger",
};

export default function DashboardPage() {
  const { ready, token, tenantId, logout } = useSession();
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const toast = useToast();
  const [books, setBooks] = useState<BookWithCover[] | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const STATUS_LABEL: Record<Book["status"], string> = {
    draft: t("statusDraft"),
    converting: t("statusConverting"),
    ready: t("statusReady"),
    published: t("statusPublished"),
    error: t("statusError"),
  };

  async function loadBooks() {
    if (!token || !tenantId) return;
    try {
      const rows = await apiFetch<BookWithCover[]>("/books", { token, tenantId });
      setBooks(rows);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorLoadBooks"));
    }
  }

  useEffect(() => {
    if (ready) void loadBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function submitCreate() {
    if (!token || !tenantId || !title.trim()) return;
    setCreating(true);
    try {
      await apiFetch<Book>("/books", { method: "POST", token, tenantId, body: { title: title.trim() } });
      setTitle("");
      setCreateOpen(false);
      await loadBooks();
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorCreateBook"));
    } finally {
      setCreating(false);
    }
  }

  if (!ready) return null;

  const createDialog = (
    <XDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      title={t("createBookDialogTitle")}
      width={400}
      footer={
        <>
          <XButton variant="neutral" onClick={() => setCreateOpen(false)}>
            {tc("cancel")}
          </XButton>
          <XButton variant="primary" loading={creating} disabled={!title.trim()} onClick={() => void submitCreate()}>
            {creating ? t("creating") : tc("create")}
          </XButton>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitCreate();
        }}
      >
        <label className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">{t("titleLabel")}</label>
        <XInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} autoFocus />
      </form>
    </XDialog>
  );

  function BookThumb({ b }: { b: BookWithCover }) {
    return b.status === "published" && b.cover_asset_id ? (
      <img
        src={assetUrl(`/public/books/${b.permalink_slug}-${b.permalink_suffix}/assets/${b.cover_asset_id}`)}
        alt=""
        className="h-full w-full object-cover"
      />
    ) : (
      <span className="text-[13px] text-[var(--xds-text-placeholder)]">{t("noCover")}</span>
    );
  }

  const emptyState = books !== null && books.length === 0 && (
    <XEmptyState
      type="initial"
      title={t("emptyTitle")}
      description={t("emptySubtitle")}
      actions={
        <XButton variant="primary" icon={<XIcon name="plus" />} onClick={() => setCreateOpen(true)}>
          {t("createBook")}
        </XButton>
      }
    />
  );

  return (
    <>
      {/* ===== Desktop ===== */}
      <div className="hidden min-h-dvh flex-col md:flex">
        <AppHeader onLogout={logout} />
        <div className="flex-1 bg-[var(--xds-bg-page)] p-4">
          <div className="mx-auto max-w-[1100px]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[20px] font-semibold leading-7 text-[var(--xds-text)]">{t("headerTitle")}</h2>
              <XButton variant="primary" icon={<XIcon name="plus" />} onClick={() => setCreateOpen(true)}>
                {t("createBook")}
              </XButton>
            </div>

            {books === null && <p className="text-[13px] text-[var(--xds-text-secondary)]">{t("loadingBooks")}</p>}
            {emptyState}
            {books && books.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                {books.map((b) => (
                  <Link
                    key={b.id}
                    href={`/dashboard/books/${b.id}`}
                    className="block overflow-hidden rounded-lg bg-[var(--xds-bg)] shadow-[var(--xds-shadow-card)]"
                  >
                    <div className="flex aspect-video items-center justify-center bg-[var(--xds-bg-disabled)]">
                      <BookThumb b={b} />
                    </div>
                    <div className="p-3">
                      <div className="mb-2 truncate text-[14px] font-medium text-[var(--xds-text)]">{b.title}</div>
                      <XTag color={STATUS_COLOR[b.status]}>{STATUS_LABEL[b.status]}</XTag>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {createDialog}

      {/* ===== Mobile ===== */}
      <div className="xds-mobile-app flex min-h-dvh flex-col md:hidden">
        <MobileTopBar title={t("headerTitle")} actions={<MobileHeaderActions onLogout={logout} />} />
        <div className="relative flex-1 overflow-y-auto bg-[var(--xds-bg-page)] xds-mobile-gutter-x py-4">
          {books === null && <p className="text-[13px] text-[var(--xds-text-secondary)]">{t("loadingBooks")}</p>}
          {emptyState}
          {books && books.length > 0 && (
            <div className="flex flex-col gap-2">
              {books.map((b) => (
                <Link
                  key={b.id}
                  href={`/dashboard/books/${b.id}`}
                  className="flex min-h-[48px] items-center gap-3 rounded-lg bg-[var(--xds-bg)] p-2 shadow-[var(--xds-shadow-card)]"
                >
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--xds-bg-disabled)] text-[11px]">
                    <BookThumb b={b} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="xds-mobile-single-line text-[14px] font-medium text-[var(--xds-text)]">{b.title}</div>
                    <div className="mt-1">
                      <XTag color={STATUS_COLOR[b.status]} size="sm">
                        {STATUS_LABEL[b.status]}
                      </XTag>
                    </div>
                  </div>
                  <XIcon name="chevron-right" size={20} className="shrink-0 text-[var(--xds-icon-neutral)]" />
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label={t("createBook")}
            className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--xds-brand-600)] text-white shadow-[var(--xds-shadow-lg)]"
          >
            <XIcon name="plus" size={26} />
          </button>
        </div>
      </div>
    </>
  );
}
