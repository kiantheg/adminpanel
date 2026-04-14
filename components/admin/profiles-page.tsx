"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { BooleanChoice, EmptyState, Modal, PageHeader, Pagination, StatusBanner } from "@/components/admin/ui";
import { formatDate, shortId } from "@/lib/admin-ui";
import { listProfiles, updateProfileFlags, type Profile } from "@/lib/supabase-rest";

const PAGE_SIZE = 20;

export function ProfilesPage() {
  const { token } = useAdmin();
  const [rows, setRows] = useState<Profile[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (nextPage = page) => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const result = await listProfiles(token, nextPage, PAGE_SIZE);
      setRows(result.rows);
      setTotal(result.total);
      setPage(result.page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load profiles.");
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => {
      const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.toLowerCase();
      return (
        fullName.includes(normalized) ||
        (row.email ?? "").toLowerCase().includes(normalized) ||
        row.id.toLowerCase().includes(normalized)
      );
    });
  }, [query, rows]);

  const toggleSuperAdmin = async (row: Profile, value: boolean) => {
    if (!token) return;
    try {
      setError(null);
      setSuccess(null);
      await updateProfileFlags(token, row.id, { is_superadmin: value });
      setRows((current) =>
        current.map((entry) => (entry.id === row.id ? { ...entry, is_superadmin: value } : entry)),
      );
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
            <button type="button" className="secondaryButton" onClick={() => void load(page)}>
              Refresh
            </button>
          </div>
        }
      />

      <StatusBanner kind="error" message={error} onDismiss={() => setError(null)} />
      <StatusBanner kind="success" message={success} onDismiss={() => setSuccess(null)} />

      <section className="panelCard">
        <div className="toolbar">
          <input
            className="searchInput"
            type="search"
            placeholder="Search name, email, or profile id"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="supporting">
            {filteredRows.length} result{filteredRows.length === 1 ? "" : "s"} on this page
          </p>
        </div>

        {loading ? (
          <div className="tableLoading">Loading profiles…</div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No profiles on this page"
            description="Try a different search or move to another page."
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
                {filteredRows.map((row) => (
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

        <Pagination current={page} total={totalPages} onChange={(nextPage) => void load(nextPage)} />
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
