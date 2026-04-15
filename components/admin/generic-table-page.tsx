"use client";

import { useCallback, useMemo, useState } from "react";
import { AdminImage } from "@/components/admin/admin-image";
import { useAdmin } from "@/components/admin/admin-provider";
import { useAdminTableController } from "@/components/admin/use-admin-table-controller";
import { BooleanChoice, EmptyState, Modal, PageHeader, Pagination, StatusBanner } from "@/components/admin/ui";
import type { AdminResource } from "@/lib/admin-resources";
import {
  buildPayload,
  displayValue,
  formatDate,
  inferFormFields,
  initFormState,
  matchesSearchQuery,
  validateRequiredFields,
} from "@/lib/admin-ui";
import {
  deleteTableRowByField,
  insertTableRow,
  listAllTableRows,
  listImagesByIds,
  listTableRows,
  updateTableRowByField,
  type GenericRow,
  type ImageRow,
} from "@/lib/supabase-rest";

const PAGE_SIZE = 20;

type DrawerState =
  | { mode: "create" }
  | { mode: "view"; row: GenericRow }
  | { mode: "edit"; row: GenericRow }
  | null;

function primitivePk(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

function resolveImageUrl(row: GenericRow, imagesById: Record<string, ImageRow>) {
  if (typeof row.url === "string" && row.url.startsWith("http")) {
    return row.url;
  }
  if (typeof row.image_id === "string") {
    return imagesById[row.image_id]?.url ?? null;
  }
  return null;
}

function getBooleanLabels(fieldName: string) {
  if (fieldName === "is_public") {
    return { trueLabel: "Public", falseLabel: "Private" };
  }
  return { trueLabel: "Enabled", falseLabel: "Disabled" };
}

export function GenericTablePage({ resource }: { resource: AdminResource }) {
  const { token } = useAdmin();
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPage = useCallback(async (nextPage: number) => {
    if (!token) {
      return { rows: [], total: 0, page: 1, extra: {} as Record<string, ImageRow> };
    }

    const result = await listTableRows(
      token,
      resource.table,
      nextPage,
      PAGE_SIZE,
      "*",
      resource.defaultOrder ?? "created_datetime_utc.desc.nullslast",
    );

    const imageIds = [
      ...new Set(
        result.rows
          .map((row) => row.image_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    ];
    const linkedImages = await listImagesByIds(token, imageIds);

    return {
      rows: result.rows,
      total: result.total,
      page: result.page,
      extra: Object.fromEntries(linkedImages.map((image) => [image.id, image])),
    };
  }, [resource.defaultOrder, resource.table, token]);

  const fetchAll = useCallback(async () => {
    if (!token) {
      return { rows: [], extra: {} as Record<string, ImageRow> };
    }

    const allRows = await listAllTableRows(
      token,
      resource.table,
      "*",
      resource.defaultOrder ?? "created_datetime_utc.desc.nullslast",
    );

    const imageIds = [
      ...new Set(
        allRows
          .map((row) => row.image_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    ];
    const linkedImages = await listImagesByIds(token, imageIds);

    return {
      rows: allRows,
      extra: Object.fromEntries(linkedImages.map((image) => [image.id, image])),
    };
  }, [resource.defaultOrder, resource.table, token]);

  const {
    currentPage,
    error,
    extra,
    loading,
    query,
    rows,
    searchActive,
    setError,
    setPage,
    setQuery,
    total,
    totalPages,
    refresh,
  } = useAdminTableController<GenericRow, Record<string, ImageRow>>({
    token,
    pageSize: PAGE_SIZE,
    loadErrorMessage: `Failed to load ${resource.label}.`,
    fetchPage,
    fetchAll,
    filterRows: useCallback((inputRows, currentQuery) => inputRows.filter((row) => matchesSearchQuery(row, currentQuery)), []),
    resetKey: resource.key,
  });
  const imagesById = extra ?? {};
  const formFields = useMemo(
    () => resource.formFields ?? inferFormFields(rows, resource.previewFields, resource.pkField),
    [resource, rows],
  );

  const viewedImageUrl = drawer?.mode === "view" ? resolveImageUrl(drawer.row, imagesById) : null;
  const editedImageUrl =
    drawer?.mode === "edit"
      ? typeof form.url === "string" && form.url.startsWith("http")
        ? form.url
        : typeof form.image_id === "string"
          ? imagesById[form.image_id]?.url ?? null
          : null
      : null;

  const openCreate = () => {
    setForm(initFormState(formFields));
    setDrawer({ mode: "create" });
  };

  const openEdit = (row: GenericRow) => {
    setForm(initFormState(formFields, row));
    setDrawer({ mode: "edit", row });
  };

  const save = async () => {
    if (!token || !drawer) return;

    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      validateRequiredFields(formFields, form);
      const payload = buildPayload(formFields, form, drawer.mode === "edit");

      if (drawer.mode === "create") {
        await insertTableRow(token, resource.table, payload);
        setSuccess(`Created a row in ${resource.table}.`);
        setDrawer(null);
        refresh(1);
        return;
      }

      if (drawer.mode === "edit") {
        const pkValue = primitivePk(drawer.row[resource.pkField]);
        if (pkValue === null) {
          throw new Error(`Missing primitive ${resource.pkField} value.`);
        }
        await updateTableRowByField(token, resource.table, resource.pkField, pkValue, payload);
        setSuccess(`Updated ${resource.table}.${resource.pkField}=${String(pkValue)}.`);
        setDrawer(null);
        refresh(currentPage);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to save row.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: GenericRow) => {
    if (!token) return;
    const pkValue = primitivePk(row[resource.pkField]);
    if (pkValue === null) {
      setError(`Missing primitive ${resource.pkField} value.`);
      return;
    }
    if (!window.confirm(`Delete ${resource.table}.${resource.pkField}=${String(pkValue)}?`)) return;

    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      await deleteTableRowByField(token, resource.table, resource.pkField, pkValue);
      setSuccess(`Deleted ${resource.table}.${resource.pkField}=${String(pkValue)}.`);
      refresh(rows.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete row.");
    } finally {
      setBusy(false);
    }
  };

  const canCreate = resource.capability === "crud";
  const canEdit = resource.capability === "crud" || resource.capability === "update";
  const canDelete = resource.capability === "crud";

  return (
    <div className="pageContent">
      <PageHeader
        eyebrow="Database entity"
        title={resource.label}
        description={resource.description}
        actions={
          <div className="headerActions">
            <button type="button" className="secondaryButton" onClick={() => refresh(currentPage)}>
              Refresh
            </button>
            {canCreate && (
              <button type="button" className="primaryButton" onClick={openCreate}>
                Create row
              </button>
            )}
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
            placeholder={`Search ${resource.label.toLowerCase()} for any matching value`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="supporting">
            Table <code>{resource.table}</code> ·{" "}
            {searchActive
              ? `${total} matching row${total === 1 ? "" : "s"}`
              : `${total} total row${total === 1 ? "" : "s"}`}
          </p>
        </div>

        {loading ? (
          <div className="tableLoading">Loading rows…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={searchActive ? `No matching ${resource.label.toLowerCase()} rows` : `No ${resource.label.toLowerCase()} rows found`}
            description={
              searchActive
                ? "Try a broader search or clear the current query."
                : canCreate
                ? "Use the create action to add a new row."
                : "No rows are currently available for this table."
            }
            action={
              canCreate ? (
                <button type="button" className="primaryButton" onClick={openCreate}>
                  Create row
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="tableCard">
            <table className="dataTable">
              <thead>
                <tr>
                  {resource.previewFields.map((field) => (
                    <th key={field}>{field}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${String(row[resource.pkField] ?? index)}-${index}`}>
                    {resource.previewFields.map((field) => (
                      <td key={field}>
                        {field === "created_datetime_utc" || field === "modified_datetime_utc" ? (
                          formatDate(typeof row[field] === "string" ? row[field] : null)
                        ) : field === "image_id" && typeof row.image_id === "string" && imagesById[row.image_id]?.url ? (
                          <div className="linkedImageCell">
                            <AdminImage
                              src={imagesById[row.image_id].url}
                              alt={`Image ${String(row.image_id)}`}
                              wrapperClassName="tableThumb"
                              compact
                            />
                            <div className="cellSubtle">{displayValue(row[field])}</div>
                          </div>
                        ) : (
                          <span className="tableValueClamp">{displayValue(row[field])}</span>
                        )}
                      </td>
                    ))}
                    <td>
                      <div className="rowActions">
                        <button type="button" className="secondaryButton" onClick={() => setDrawer({ mode: "view", row })}>
                          View
                        </button>
                        {canEdit && (
                          <button type="button" className="secondaryButton" onClick={() => openEdit(row)}>
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" className="dangerButton" onClick={() => void remove(row)} disabled={busy}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination current={currentPage} total={totalPages} onChange={setPage} />
      </section>

      {drawer?.mode === "view" && (
        <Modal title={`${resource.label} details`} subtitle={resource.table} onClose={() => setDrawer(null)}>
          {viewedImageUrl && (
            <div className="detailMedia detailMediaViewer">
              <AdminImage
                src={viewedImageUrl}
                alt={`${resource.label} preview`}
                wrapperClassName="adminImageStage"
                imageClassName="detailImage"
                fit="contain"
                loading="eager"
                fallbackTitle="Image preview unavailable"
              />
            </div>
          )}
          <div className="detailGrid">
            {Object.entries(drawer.row).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{displayValue(value)}</dd>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {(drawer?.mode === "create" || drawer?.mode === "edit") && (
        <Modal
          title={drawer.mode === "create" ? `Create ${resource.label}` : `Edit ${resource.label}`}
          subtitle={resource.table}
          onClose={() => setDrawer(null)}
        >
          {editedImageUrl && (
            <div className="uploadPreviewLayout">
              <div className="detailMedia detailMediaLarge">
                <AdminImage
                  src={editedImageUrl}
                  alt={`${resource.label} linked image`}
                  wrapperClassName="adminImageStage"
                  imageClassName="detailImage"
                  fit="contain"
                  loading="eager"
                  fallbackTitle="Linked image unavailable"
                />
              </div>
              <div className="detailGrid detailGridCompact">
                <div>
                  <dt>Linked image preview</dt>
                  <dd>This is the image currently associated with the record.</dd>
                </div>
                <div>
                  <dt>Image source</dt>
                  <dd>{editedImageUrl}</dd>
                </div>
              </div>
            </div>
          )}
          <div className="formGrid">
            {formFields.length === 0 ? (
              <p className="supporting">No editable fields were inferred for this table yet.</p>
            ) : (
              formFields.map((field) => (
                <label
                  key={field.name}
                  className={field.type === "longtext" || field.type === "json" ? "field fieldFull" : "field"}
                >
                  <span>{field.label}</span>
                  {field.type === "boolean" ? (
                    <BooleanChoice
                      value={form[field.name] === "true"}
                      onChange={(nextValue) =>
                        setForm((current) => ({ ...current, [field.name]: nextValue ? "true" : "false" }))
                      }
                      trueLabel={getBooleanLabels(field.name).trueLabel}
                      falseLabel={getBooleanLabels(field.name).falseLabel}
                    />
                  ) : field.type === "longtext" || field.type === "json" ? (
                    <textarea
                      className="textArea"
                      value={form[field.name] ?? ""}
                      onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <input
                      className="textInput"
                      type={field.type === "number" ? "number" : "text"}
                      value={form[field.name] ?? ""}
                      onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                      placeholder={field.placeholder}
                    />
                  )}
                </label>
              ))
            )}
          </div>

          {formFields.length > 0 && (
            <div className="drawerActions">
              <button type="button" className="primaryButton" onClick={() => void save()} disabled={busy}>
                {busy ? "Saving..." : drawer.mode === "create" ? "Create row" : "Save changes"}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
