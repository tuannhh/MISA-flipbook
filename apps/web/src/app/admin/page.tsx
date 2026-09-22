"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/lib/useSession";
import { apiFetch, ApiError } from "@/lib/api";
import type { AdminBook, AdminBooksPage, AdminStats, AdminTenant, Book, Me } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { MobileTopBar } from "@/components/MobileTopBar";
import { MobileHeaderActions } from "@/components/MobileHeaderActions";
import { XButton } from "@/components/xds/XButton";
import { XCheckbox } from "@/components/xds/XCheckbox";
import { XInput } from "@/components/xds/XInput";
import { XSelect } from "@/components/xds/XSelect";
import { XDatePicker } from "@/components/xds/XDatePicker";
import { XDialog } from "@/components/xds/XDialog";
import { XIcon } from "@/components/xds/icons/XIcon";
import { useToast } from "@/components/xds/XToast";
import { formatDateVN } from "@/lib/format";

const PAGE_SIZE_OPTIONS = ["10", "20", "50"] as const;

function dateParam(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// F13-simplification: nguoi dung yeu cau don gian hoa toan bo trang Admin - bo Tenants/
// Accounts/Job loi/Audit log (qua "ky thuat" voi 1 Admin khong chuyen mon), chi giu lai
// 2 so tong quan + 1 danh sach SACH DA DANG chi tiet (xem/sua/xoa, tick chon xoa hang
// loat, loc theo khoang ngay dang, phan trang 10/20/50). Xem/Sua dieu huong sang lai
// trang chi tiet sach cua Creator (dashboard/books/[id]/page.tsx) qua ?tenantId= override
// trong useSession - tranh dung 1 UI sua sach rieng cho Admin.
export default function AdminPage() {
  const router = useRouter();
  const { ready, token, logout } = useAdminSession();
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const toast = useToast();

  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [books, setBooks] = useState<AdminBook[] | null>(null);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [booksTotal, setBooksTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>("10");
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createTenantId, setCreateTenantId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Khoi phuc luong tao Creator/don vi (bi go khoi UI trong dot F13-simplification,
  // API /admin/tenants /admin/users /admin/memberships van con nguyen - xem
  // admin.controller.ts). Gop tao tenant + user + membership vao 1 form cho don gian.
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorTenantName, setCreatorTenantName] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");
  const [creatorPassword, setCreatorPassword] = useState("");
  const [creatingCreator, setCreatingCreator] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const request = ++requestVersion.current;
    const query = new URLSearchParams({ limit: pageSize });
    if (dateFrom) query.set("from", dateParam(dateFrom));
    if (dateTo) query.set("to", dateParam(dateTo));
    const activeCursor = cursorHistory.at(-1);
    if (activeCursor) query.set("cursor", activeCursor);
    try {
      const [meRes, statsRes, booksRes, tenantsRes] = await Promise.all([
        apiFetch<Me>("/me", { token }),
        apiFetch<AdminStats>("/admin/stats", { token }),
        apiFetch<AdminBooksPage>(`/admin/books?${query.toString()}`, { token }),
        apiFetch<AdminTenant[]>("/admin/tenants", { token }),
      ]);
      if (request !== requestVersion.current) return;
      if (!meRes.isSystemAdmin) {
        setForbidden(true);
        return;
      }
      setMe(meRes);
      setStats(statsRes);
      setBooks(booksRes.items);
      const activeTenants = tenantsRes.filter((tenant) => tenant.status === "active");
      setTenants(activeTenants);
      setCreateTenantId((current) => (current && activeTenants.some((tenant) => tenant.id === current) ? current : activeTenants[0]?.id ?? null));
      setBooksTotal(booksRes.total);
      setNextCursor(booksRes.nextCursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return;
      }
      toast("error", err instanceof ApiError ? err.message : t("errorLoad"));
    }
  }, [token, toast, t, pageSize, dateFrom, dateTo, cursorHistory]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  useEffect(() => {
    setCursorHistory([null]);
    setSelected(new Set());
  }, [dateFrom, dateTo, pageSize]);

  const pageSizeNum = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(booksTotal / pageSizeNum));
  const pageClamped = cursorHistory.length;
  const pagedBooks = books ?? [];
  const pagedIds = useMemo(() => pagedBooks.map((b) => b.id), [pagedBooks]);
  const allPagedSelected = pagedIds.length > 0 && pagedIds.every((id) => selected.has(id));

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pagedIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function openView(b: AdminBook) {
    router.push(`/dashboard/books/${b.id}?tenantId=${b.tenant_id}`);
  }

  function openCreate(): void {
    setCreateTitle("");
    setCreateOpen(true);
  }

  async function submitCreate(): Promise<void> {
    if (!token || !createTenantId || !createTitle.trim()) return;
    setCreating(true);
    try {
      const book = await apiFetch<Book>("/books", {
        method: "POST",
        token,
        tenantId: createTenantId,
        body: { title: createTitle.trim() },
      });
      toast("success", t("noticeBookCreated"));
      setCreateOpen(false);
      router.push(`/dashboard/books/${book.id}?tenantId=${createTenantId}`);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorCreateBook"));
    } finally {
      setCreating(false);
    }
  }

  function openCreateCreator(): void {
    setCreatorTenantName("");
    setCreatorEmail("");
    setCreatorPassword("");
    setCreatorOpen(true);
  }

  async function submitCreateCreator(): Promise<void> {
    if (!token || !creatorTenantName.trim() || !creatorEmail.trim() || creatorPassword.length < 8) return;
    setCreatingCreator(true);
    try {
      const tenant = await apiFetch<AdminTenant>("/admin/tenants", {
        method: "POST",
        token,
        body: { name: creatorTenantName.trim() },
      });
      const user = await apiFetch<{ id: string }>("/admin/users", {
        method: "POST",
        token,
        body: { email: creatorEmail.trim().toLowerCase(), password: creatorPassword },
      });
      await apiFetch("/admin/memberships", {
        method: "POST",
        token,
        body: { tenantId: tenant.id, userId: user.id },
      });
      toast("success", t("noticeCreatorCreated"));
      setCreatorOpen(false);
      await load();
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorCreateCreator"));
    } finally {
      setCreatingCreator(false);
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return;
    const ids = deleteTarget.ids;
    try {
      await Promise.all(ids.map((id) => apiFetch(`/admin/books/${id}`, { method: "DELETE", token })));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      toast("success", ids.length > 1 ? t("noticeBooksDeleted", { count: ids.length }) : t("noticeBookDeleted"));
      await load();
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : t("errorDelete"));
    }
  }

  if (!ready) return null;

  if (forbidden) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 text-center">
        <p className="text-[13px] text-[var(--xds-text-secondary)]">{t("errorForbidden")}</p>
      </div>
    );
  }

  if (!me || !stats || !books) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-[var(--xds-text-secondary)]">{tc("loading")}</div>;
  }

  const pageSizeOptions = PAGE_SIZE_OPTIONS.map((v) => ({ label: v, value: v }));
  const tenantOptions = tenants.map((tenant) => ({ label: tenant.name, value: tenant.id }));

  const statsCard = (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("overviewTitle")}</h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          [t("statPublished"), stats.published_count],
          [t("statOpens"), stats.total_opens],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-[var(--xds-bg-page)] p-3">
            <div className="text-[12px] text-[var(--xds-text-secondary)]">{label}</div>
            <div className="mt-1 text-[18px] font-semibold text-[var(--xds-text)]">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const booksCard = (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("booksTitle")}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[140px]">
            <label className="mb-1 block text-[12px] text-[var(--xds-text-secondary)]">{t("dateFromLabel")}</label>
            <XDatePicker value={dateFrom} onChange={setDateFrom} max={dateTo ?? undefined} />
          </div>
          <div className="w-[140px]">
            <label className="mb-1 block text-[12px] text-[var(--xds-text-secondary)]">{t("dateToLabel")}</label>
            <XDatePicker value={dateTo} onChange={setDateTo} min={dateFrom ?? undefined} />
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3">
          <XButton variant="danger" onClick={() => setDeleteTarget({ ids: Array.from(selected), label: "" })}>
            {t("bulkDeleteButton", { count: selected.size })}
          </XButton>
        </div>
      )}

      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="sticky top-0 border-b border-[var(--xds-border-light)] bg-[var(--xds-bg)] text-left text-[var(--xds-text-secondary)]">
              <th className="w-8 py-1 pr-2">
                <XCheckbox checked={allPagedSelected} onChange={toggleAllOnPage} />
              </th>
              <th className="py-1 pr-2 font-medium">{t("colTitle")}</th>
              <th className="py-1 pr-2 font-medium">{t("colOwner")}</th>
              <th className="py-1 pr-2 font-medium">{t("colPublishedAt")}</th>
              <th className="py-1 pr-2 font-medium">{t("colViews")}</th>
              <th className="py-1 pr-2 font-medium">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedBooks.map((b) => (
              <tr key={b.id} className="border-b border-[var(--xds-border-light)] last:border-b-0">
                <td className="py-1.5 pr-2">
                  <XCheckbox checked={selected.has(b.id)} onChange={(checked) => toggleOne(b.id, checked)} />
                </td>
                <td className="py-1.5 pr-2 text-[var(--xds-text)]">{b.title}</td>
                <td className="py-1.5 pr-2 text-[var(--xds-text)]">{b.owner_email}</td>
                <td className="py-1.5 pr-2 text-[var(--xds-text)]">{formatDateVN(b.published_at)}</td>
                <td className="py-1.5 pr-2 text-[var(--xds-text)]">{b.views}</td>
                <td className="py-1.5 pr-2">
                  <div className="flex gap-2">
                    <XButton variant="neutral" onClick={() => openView(b)}>
                      {t("actionView")}
                    </XButton>
                    <XButton variant="danger" onClick={() => setDeleteTarget({ ids: [b.id], label: b.title })}>
                      {t("actionDelete")}
                    </XButton>
                  </div>
                </td>
              </tr>
            ))}
            {pagedBooks.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-[var(--xds-text-secondary)]">
                  {t("noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--xds-text-secondary)]">{t("pageSizeLabel")}</span>
          <div className="w-[80px]">
            <XSelect value={pageSize} options={pageSizeOptions} onChange={setPageSize} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <XButton variant="icon" disabled={pageClamped <= 1} onClick={() => setCursorHistory((history) => history.slice(0, -1))} icon={<XIcon name="chevron-left" />} aria-label={t("prevPage")} />
          <span className="text-[13px] text-[var(--xds-text-secondary)]">{t("paginationInfo", { page: pageClamped, total: totalPages })}</span>
          <XButton variant="icon" disabled={!nextCursor} onClick={() => nextCursor && setCursorHistory((history) => [...history, nextCursor])} icon={<XIcon name="chevron-right" />} aria-label={t("nextPage")} />
        </div>
      </div>
    </div>
  );

  const createDialog = (
    <XDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      title={t("createBookDialogTitle")}
      width={440}
      footer={
        <>
          <XButton variant="neutral" onClick={() => setCreateOpen(false)}>{tc("cancel")}</XButton>
          <XButton variant="primary" loading={creating} disabled={!createTenantId || !createTitle.trim()} onClick={() => void submitCreate()}>
            {creating ? t("creating") : tc("create")}
          </XButton>
        </>
      }
    >
      {tenants.length === 0 ? (
        <p className="text-[13px] text-[var(--xds-text-secondary)]">{t("noActiveTenant")}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCreate();
          }}
        >
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">{t("tenantLabel")}</label>
            <XSelect value={createTenantId} options={tenantOptions} placeholder={t("tenantPlaceholder")} onChange={setCreateTenantId} />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">{t("titleLabel")}</label>
            <XInput value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder={t("titlePlaceholder")} autoFocus />
          </div>
          <p className="text-[12px] leading-4 text-[var(--xds-text-secondary)]">{t("createBookOwnerNote")}</p>
        </form>
      )}
    </XDialog>
  );

  const creatorDialog = (
    <XDialog
      open={creatorOpen}
      onOpenChange={setCreatorOpen}
      title={t("createCreatorDialogTitle")}
      width={440}
      footer={
        <>
          <XButton variant="neutral" onClick={() => setCreatorOpen(false)}>{tc("cancel")}</XButton>
          <XButton
            variant="primary"
            loading={creatingCreator}
            disabled={!creatorTenantName.trim() || !creatorEmail.trim() || creatorPassword.length < 8}
            onClick={() => void submitCreateCreator()}
          >
            {creatingCreator ? t("creating") : tc("create")}
          </XButton>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submitCreateCreator();
        }}
      >
        <div>
          <label className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">{t("tenantNameLabel")}</label>
          <XInput value={creatorTenantName} onChange={(event) => setCreatorTenantName(event.target.value)} placeholder={t("tenantNamePlaceholder")} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">{t("creatorEmailLabel")}</label>
          <XInput type="email" value={creatorEmail} onChange={(event) => setCreatorEmail(event.target.value)} placeholder={t("creatorEmailPlaceholder")} />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium text-[var(--xds-text-secondary)]">{t("creatorPasswordLabel")}</label>
          <XInput type="password" value={creatorPassword} onChange={(event) => setCreatorPassword(event.target.value)} placeholder={t("creatorPasswordPlaceholder")} />
        </div>
        <p className="text-[12px] leading-4 text-[var(--xds-text-secondary)]">{t("createCreatorNote")}</p>
      </form>
    </XDialog>
  );

  const deleteDialog = (
    <XDialog
      open={deleteTarget !== null}
      onOpenChange={(v) => !v && setDeleteTarget(null)}
      title={deleteTarget && deleteTarget.ids.length > 1 ? t("confirmBulkDeleteTitle", { count: deleteTarget.ids.length }) : t("confirmDeleteBookTitle")}
      type="danger"
      confirmText={t("actionDelete")}
      onConfirm={confirmDelete}
    >
      {deleteTarget && deleteTarget.ids.length > 1 ? t("confirmBulkDeleteDesc") : t("confirmDeleteBookDesc", { title: deleteTarget?.label ?? "" })}
    </XDialog>
  );

  const creatorCard = (
    <div className="rounded-lg bg-[var(--xds-bg)] p-4 shadow-[var(--xds-shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("creatorSectionTitle")}</h2>
          <p className="mt-1 text-[12px] leading-4 text-[var(--xds-text-secondary)]">{t("creatorSectionDesc")}</p>
        </div>
        <XButton variant="neutral" icon={<XIcon name="plus" />} onClick={openCreateCreator}>
          {t("createCreator")}
        </XButton>
      </div>
    </div>
  );

  const sections = (
    <div className="flex flex-col gap-4">
      {statsCard}
      {creatorCard}
      {booksCard}
    </div>
  );

  return (
    <>
      {/* ===== Desktop ===== */}
      <div className="hidden min-h-dvh flex-col md:flex">
        <AppHeader onLogout={logout} isAdmin />
        <div className="flex-1 bg-[var(--xds-bg-page)] p-4">
          <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-[20px] font-semibold leading-7 text-[var(--xds-text)]">{t("pageTitle")}</h1>
              <XButton variant="primary" icon={<XIcon name="plus" />} disabled={tenants.length === 0} onClick={openCreate}>
                {t("createBook")}
              </XButton>
            </div>
            {sections}
          </div>
        </div>
      </div>

      {/* ===== Mobile ===== */}
      <div className="xds-mobile-app relative flex min-h-dvh flex-col md:hidden">
        <MobileTopBar title={t("pageTitle")} actions={<MobileHeaderActions onLogout={logout} isAdmin />} />
        <div className="flex-1 overflow-y-auto bg-[var(--xds-bg-page)] xds-mobile-gutter-x py-4">{sections}</div>
        <button
          type="button"
          disabled={tenants.length === 0}
          onClick={openCreate}
          aria-label={t("createBook")}
          className="fixed bottom-6 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--xds-brand-600)] text-white shadow-[var(--xds-shadow-lg)] disabled:cursor-not-allowed disabled:bg-[var(--xds-bg-disabled)]"
        >
          <XIcon name="plus" size={26} />
        </button>
      </div>

      {createDialog}
      {creatorDialog}
      {deleteDialog}
    </>
  );
}
