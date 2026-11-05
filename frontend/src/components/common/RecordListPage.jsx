// Shared list screen for leads / contacts / companies / deals: search, filters,
// sort, paging, bulk actions (on the selected rows or on every matching record),
// import and export.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiPlus,
  FiDownload,
  FiUpload,
  FiSearch,
  FiShare2,
  FiRepeat,
  FiTrash2,
  FiFilter,
} from "react-icons/fi";
import api, { download, errorMessage } from "../../services/axiosInstance";
import { useApi, useDebounce } from "../../hooks/useApi";
import { toast } from "../../store/uiStore";
import { useSalesIdStore } from "../../store/salesIdStore";
import DataTable from "./DataTable";
import { PageHeader, ConfirmDialog, EmptyState } from "./ui";
import { ShareTransferModal, ImportModal } from "./RecordTools";

const DEFAULT_EXPORTS = [
  { label: "CSV", params: { format: "csv" } },
  { label: "Excel (.xlsx)", params: { format: "xlsx" } },
];

export default function RecordListPage({
  entity,
  title,
  subtitle,
  columns,
  filters = [],
  createLabel,
  onCreate,
  importHint,
  importOptions,
  templateUrl,
  importOwnerOptional,
  exportOptions = DEFAULT_EXPORTS,
  defaultSort = "-createdAt",
  extraActions,
  bulkPatch,
  bulkActions,
  emptyIcon,
  reloadKey,
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(defaultSort);
  const [f, setF] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState([]);
  const [allMatching, setAllMatching] = useState(false);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const options = useSalesIdStore((s) => s.options);
  const dq = useDebounce(q);
  const filterParams = {
    q: dq || undefined,
    ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
  };
  const params = { ...filterParams, page, pageSize: 25, sort };
  const { data, meta, loading, error, reload } = useApi(
    () => api.get(`/${entity}`, { params }),
    [JSON.stringify(params), reloadKey],
  );
  const clearSelection = () => {
    setSelected([]);
    setAllMatching(false);
  };
  const setFilter = (k, v) => {
    setF({ ...f, [k]: v });
    setPage(1);
    clearSelection();
  };

  // What a bulk action applies to: the ticked rows, or every record matching the filters.
  const target = allMatching
    ? { all: true, query: { ...filterParams, sort } }
    : { ids: selected };
  const count = allMatching ? (meta?.total ?? 0) : selected.length;
  const pageAllSelected =
    data?.length > 0 && data.every((r) => selected.includes(r.id));

  const bulkDelete = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/${entity}/bulk-delete`, target);
      toast(
        `${r.data.data.succeeded.length} deleted${r.data.data.failed.length ? `, ${r.data.data.failed.length} not allowed` : ""}`,
      );
      clearSelection();
      setModal(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const doPatch = async (patch) => {
    try {
      const r = await api.post(`/${entity}/bulk-update`, { ...target, patch });
      const failed = r.data.data.failed.length;
      toast(
        `${r.data.data.succeeded.length} updated${failed ? `, ${failed} not allowed (view-only)` : ""}`,
        failed ? "error" : "success",
      );
      clearSelection();
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {extraActions}
            {importHint && (
              <button
                className="btn-secondary"
                onClick={() => setModal("import")}
              >
                <FiUpload /> Import
              </button>
            )}
            <div className="relative">
              <button
                className="btn-secondary"
                onClick={() => setModal(modal === "export" ? null : "export")}
              >
                <FiDownload /> Export
              </button>
              {modal === "export" && (
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
                  {exportOptions.map((o) => (
                    <button
                      key={o.label}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-50"
                      onClick={() => {
                        setModal(null);
                        download(
                          `/${entity}/export`,
                          { ...filterParams, sort, ...o.params },
                          `${entity}.${o.params.format}`,
                        ).catch((e) => toast(errorMessage(e), "error"));
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                  <p className="border-t border-ink-100 px-3 py-1.5 text-[11px] text-ink-500">
                    Exports what matches the current search and filters.
                  </p>
                </div>
              )}
            </div>
            {onCreate && (
              <button className="btn-primary" onClick={onCreate}>
                <FiPlus /> {createLabel}
              </button>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[16rem] flex-1">
          <FiSearch className="absolute left-3 top-2.5 text-ink-400" />
          <input
            className="input pl-9"
            placeholder={`Search ${title.toLowerCase()}…`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
              clearSelection();
            }}
          />
        </div>
        {filters.length > 0 && (
          <button
            className="btn-secondary sm:hidden"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FiFilter /> Filters
          </button>
        )}
        <div
          className={`${showFilters ? "grid" : "hidden"} grid-cols-2 gap-2 sm:flex sm:flex-wrap`}
        >
          {filters.map((fl) => (
            <select
              key={fl.name}
              className="input sm:w-44"
              value={f[fl.name] ?? ""}
              onChange={(e) => setFilter(fl.name, e.target.value)}
              aria-label={fl.label}
            >
              <option value="">{fl.label}: all</option>
              {fl.options.map((o) =>
                Array.isArray(o) ? (
                  <option key={o[0]} value={o[0]}>
                    {o[1]}
                  </option>
                ) : (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ),
              )}
            </select>
          ))}
        </div>
      </div>

      {count > 0 && (
        <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-brand-800">
              {allMatching
                ? `All ${count} matching selected`
                : `${count} selected`}
            </span>
            {bulkPatch?.(doPatch)}
            {bulkActions?.({
              target,
              count,
              filters: filterParams,
              clear: clearSelection,
              reload,
            })}
            {!allMatching && options.length > 1 && (
              <>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setModal("share")}
                >
                  <FiShare2 /> Share
                </button>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setModal("transfer")}
                >
                  <FiRepeat /> Transfer
                </button>
              </>
            )}
            <button
              className="btn-secondary btn-sm text-red-700"
              onClick={() => setModal("delete")}
            >
              <FiTrash2 /> Delete
            </button>
            <button
              className="ml-auto text-xs text-ink-500 hover:underline"
              onClick={clearSelection}
            >
              Clear
            </button>
          </div>
          {!allMatching && pageAllSelected && meta?.total > data.length && (
            <p className="mt-1.5 text-xs text-brand-800">
              All {data.length} on this page are selected.{" "}
              <button
                className="font-semibold underline"
                onClick={() => setAllMatching(true)}
              >
                Select all {meta.total} matching {title.toLowerCase()}
              </button>
            </p>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        meta={meta}
        onPage={setPage}
        sort={sort}
        onSort={setSort}
        selectable
        selected={selected}
        onSelect={(s) => {
          setSelected(s);
          setAllMatching(false);
        }}
        onRowClick={(r) => navigate(`/${entity}/${r.id}`)}
        empty={
          <EmptyState
            icon={emptyIcon}
            title={
              dq || Object.values(f).some(Boolean)
                ? "No matches"
                : `No ${title.toLowerCase()} yet`
            }
            description={
              dq ? "Try a different search or clear the filters." : undefined
            }
            action={
              onCreate && !dq ? (
                <button className="btn-primary" onClick={onCreate}>
                  <FiPlus /> {createLabel}
                </button>
              ) : null
            }
          />
        }
      />

      <ConfirmDialog
        open={modal === "delete"}
        title={`Delete ${count} record(s)?`}
        message="Deleted records disappear from lists and reports. Records shared with you cannot be deleted."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={bulkDelete}
        onClose={() => setModal(null)}
      />
      <ShareTransferModal
        open={modal === "share" || modal === "transfer"}
        mode={modal}
        entity={entity}
        ids={selected}
        onClose={() => setModal(null)}
        onDone={() => {
          clearSelection();
          reload();
        }}
      />
      {importHint && (
        <ImportModal
          open={modal === "import"}
          onClose={() => setModal(null)}
          url={`/${entity}/import`}
          title={`Import ${title.toLowerCase()}`}
          columnsHint={importHint}
          options={importOptions}
          templateUrl={templateUrl}
          ownerOptional={importOwnerOptional}
          onDone={reload}
        />
      )}
    </div>
  );
}
