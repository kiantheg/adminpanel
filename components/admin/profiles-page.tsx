"use client";

import { useCallback, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { useAdminTableController } from "@/components/admin/use-admin-table-controller";
import { BooleanChoice, EmptyState, Modal, PageHeader, Pagination, StatusBanner } from "@/components/admin/ui";
import { formatDate, matchesSearchQuery, shortId } from "@/lib/admin-ui";
import { listAllProfiles, listProfiles, updateProfileFlags, type Profile } from "@/lib/supabase-rest";

const PAGE_SIZE = 20;

export function ProfilesPage() {
  const { token } = useAdmin();
  const [selected, setSelected] = useState<Profile | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPage = useCallback(async (nextPage: number) => {
    if (!token) {
      return { rows: [], total: 0, page: 1, extra: null };
    }
    const result = await listProfiles(token, nextPage, PAGE_SIZE);
    return { rows: result.rows, total: result.total, page: result.page, extra: null };
  }, [token]);

  const fetchAll = useCallback(async () => {
    if (!token) {
      return { rows: [], extra: null };
    }
    return { rows: await listAllProfiles(token), extra: null };
  }, [token]);

  const {
    currentPage,
    error,
    loading,
    query,
    rows,
    searchActive,
    setError,
    setPage,
    setQuery,
    total,
    totalPages,
    updateRows,
    refresh,
  } = useAdminTableController<Profile, null>({
    token,
    pageSize: PAGE_SIZE,
    loadErrorMessage: "Failed to load profiles.",
    fetchPage,
    fetchAll,
    filterRows: useCallback(
      (inputRows, currentQuery) =>
        inputRows.filter((row) =>
          matchesSearchQuery(
            {
              ...row,
              full_name: `${row.first_name ?? ""} ${row.last_name ?? ""}`,
            },
            currentQuery,
          ),
        ),
      [],
    ),
  });

  const toggleSuperAdmin = async (row: Profile, value: boolean) => {
    if (!token) return;
    try {
      setError(null);
      setSuccess(null);
      await updateProfileFlags(token, row.id, { is_superadmin: value });
      updateRows((entry) => (entry.id === row.id ? { ...entry, is_superadmin: value } : entry));
      setSelected((current) => (current?.id === row.id ? { ...current, is_superadmin: value } : current));
      setSuccess(`Updated superadmin access for ${row.email ?? shortId(row.id)}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Profile update failed.");
    }
  };

  return (
    <div className="pageContent">
      <PageHeader
        eyebrow="Core entity"
        title="Profiles"
        description="Inspect signed-up users and manage superadmin access without leaving the page."
        actions={
          <div className="headerActions">
            <button type="button" className="secondaryButton" onClick={() => refresh(currentPage)}>
              Refresh
            </button>
          </div>
        }
      />

      <StatusBanner kind="error" message={error} onDismiss={() => setError(null)} />
      <StatusBanner kind="success" message={success} onDismiss={() => setSuccess(null)} />

      <section className="panelCard tablePanel">
        <div className="toolbar">
          <input
            className="searchInput"
            type="search"
            placeholder="Search any name, email, or profile id match"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="supporting">
            {searchActive
              ? `${total} matching result${total === 1 ? "" : "s"}`
              : `${total} total profile${total === 1 ? "" : "s"}`}
          </p>
        </div>

        {loading ? (
          <div className="tableLoading">Loading profiles…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={searchActive ? "No matching profiles" : "No profiles found"}
            description={
              searchActive ? "Try a broader search or clear the current query." : "Profiles will appear here once data is available."
            }
          />
        ) : (
          <div className="tableCard">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Superadmin</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="cellTitle">{`${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "-"}</div>
                      <div className="cellSubtle">{shortId(row.id)}</div>
                    </td>
                    <td>{row.email ?? "-"}</td>
                    <td>{formatDate(row.created_datetime_utc)}</td>
                    <td>
                      <BooleanChoice
                        value={Boolean(row.is_superadmin)}
                        onChange={(nextValue) => void toggleSuperAdmin(row, nextValue)}
                        trueLabel="Enabled"
                        falseLabel="Disabled"
                        compact
                      />
                    </td>
                    <td>
                      <button type="button" className="secondaryButton" onClick={() => setSelected(row)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination current={currentPage} total={totalPages} onChange={setPage} />
      </section>

      {selected && (
        <Modal title="Profile details" subtitle={selected.email ?? shortId(selected.id)} onClose={() => setSelected(null)}>
          <dl className="detailGrid">
            <div>
              <dt>Profile ID</dt>
              <dd>{selected.id}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{selected.email ?? "-"}</dd>
            </div>
            <div>
              <dt>First name</dt>
              <dd>{selected.first_name ?? "-"}</dd>
            </div>
            <div>
              <dt>Last name</dt>
              <dd>{selected.last_name ?? "-"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(selected.created_datetime_utc)}</dd>
            </div>
            <div>
              <dt>Superadmin</dt>
              <dd>{selected.is_superadmin ? "true" : "false"}</dd>
            </div>
          </dl>
        </Modal>
      )}
    </div>
  );
}
