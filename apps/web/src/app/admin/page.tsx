"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/lib/useSession";
import { apiFetch, ApiError } from "@/lib/api";
import type { AdminBook, AdminStats, Me } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { MobileTopBar } from "@/components/MobileTopBar";
import { MobileHeaderActions } from "@/components/MobileHeaderActions";
import { XButton } from "@/components/xds/XButton";
import { XCheckbox } from "@/components/xds/XCheckbox";
import { XSelect } from "@/components/xds/XSelect";
import { XDatePicker } from "@/components/xds/XDatePicker";
import { XDialog } from "@/components/xds/XDialog";
import { XIcon } from "@/components/xds/icons/XIcon";
import { useToast } from "@/components/xds/XToast";
import { formatDateVN } from "@/lib/format";

const PAGE_SIZE_OPTIONS = ["10", "20", "50"] as const;

function dayNumber(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
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
  const [forbidden, setForbidden] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>("10");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [meRes, statsRes, booksRes] = await Promise.all([
        apiFetch<Me>("/me", { token }),
        apiFetch<AdminStats>("/admin/stats", { token }),
        apiFetch<AdminBook[]>("/admin/books", { token }),
      ]);
      if (!meRes.isSystemAdmin) {
        setForbidden(true);
        return;
      }
      setMe(meRes);
      setStats(statsRes);
      setBooks(booksRes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return;
      }
      toast("error", err instanceof ApiError ? err.message : t("errorLoad"));
    }
  }, [token, toast, t]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, pageSize]);

  const filteredBooks = useMemo(() => {
    if (!books) return [];
    if (!dateFrom && !dateTo) return books;
    return books.filter((b) => {
      if (!b.published_at) return false;
      const d = dayNumber(new Date(b.published_at));
      if (dateFrom && d < dayNumber(dateFrom)) return false;
      if (dateTo && d > dayNumber(dateTo)) return false;
      return true;
    });
  }, [books, dateFrom, dateTo]);

  const pageSizeNum = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSizeNum));
  const pageClamped = Math.min(page, totalPages);
  const pagedBooks = filteredBooks.slice((pageClamped - 1) * pageSizeNum, pageClamped * pageSizeNum);
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
          <XButton variant="icon" disabled={pageClamped <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} icon={<XIcon name="chevron-left" />} aria-label={t("prevPage")} />
          <span className="text-[13px] text-[var(--xds-text-secondary)]">{t("paginationInfo", { page: pageClamped, total: totalPages })}</span>
          <XButton variant="icon" disabled={pageClamped >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} icon={<XIcon name="chevron-right" />} aria-label={t("nextPage")} />
        </div>
      </div>
    </div>
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

  const sections = (
    <div className="flex flex-col gap-4">
      {statsCard}
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
            <h1 className="text-[20px] font-semibold leading-7 text-[var(--xds-text)]">{t("pageTitle")}</h1>
            {sections}
          </div>
        </div>
      </div>

      {/* ===== Mobile ===== */}
      <div className="xds-mobile-app flex min-h-dvh flex-col md:hidden">
        <MobileTopBar title={t("pageTitle")} actions={<MobileHeaderActions onLogout={logout} isAdmin />} />
        <div className="flex-1 overflow-y-auto bg-[var(--xds-bg-page)] xds-mobile-gutter-x py-4">{sections}</div>
      </div>

      {deleteDialog}
    </>
  );
}
