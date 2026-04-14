"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { BooleanChoice, EmptyState, Modal, PageHeader, Pagination, StatusBanner } from "@/components/admin/ui";
import {
  formatDate,
  initFormState,
  shortId,
  validateRequiredFields,
} from "@/lib/admin-ui";
import {
  deleteCaption,
  insertTableRow,
  listCaptions,
  listImagesByIds,
  updateCaptionPublic,
  updateTableRowByField,
  type CaptionRow,
  type GenericRow,
  type ImageRow,
} from "@/lib/supabase-rest";

const PAGE_SIZE = 12;
const CAPTION_FIELDS = [
  { name: "profile_id", label: "Profile ID", required: true },
  { name: "image_id", label: "Image ID", required: true },
  { name: "content", label: "Caption", required: true },
  { name: "is_public", label: "Public", type: "boolean" as const },
];

type CaptionDrawerState =
  | { mode: "create" }
  | { mode: "view"; caption: CaptionRow }
  | { mode: "edit"; caption: CaptionRow }
  | null;

export function CaptionsPage() {
  const { me, token } = useAdmin();
  const [rows, setRows] = useState<CaptionRow[]>([]);
  const [imagesById, setImagesById] = useState<Record<string, ImageRow>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<CaptionDrawerState>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (nextPage = page) => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const captions = await listCaptions(token, nextPage, PAGE_SIZE);
      setRows(captions.rows);
      setTotal(captions.total);
      setPage(captions.page);

      const images = await listImagesByIds(
        token,
        [...new Set(captions.rows.map((row) => row.image_id).filter(Boolean))],
      );
      setImagesById(Object.fromEntries(images.map((image) => [image.id, image])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load captions.");
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
      const imageUrl = imagesById[row.image_id]?.url ?? "";
      return (
        row.id.toLowerCase().includes(normalized) ||
        row.image_id.toLowerCase().includes(normalized) ||
        row.profile_id.toLowerCase().includes(normalized) ||
        row.content.toLowerCase().includes(normalized) ||
        imageUrl.toLowerCase().includes(normalized)
      );
    });
  }, [imagesById, query, rows]);

  const formImage = form.image_id ? imagesById[form.image_id] : null;

  const openCreate = () => {
    setForm({
      profile_id: me?.id ?? "",
      image_id: "",
      content: "",
      is_public: "true",
    });
    setDrawer({ mode: "create" });
  };

  const openEdit = (caption: CaptionRow) => {
    setForm(initFormState(CAPTION_FIELDS, caption as unknown as GenericRow));
    setDrawer({ mode: "edit", caption });
  };

  const togglePublic = async (caption: CaptionRow, isPublic: boolean) => {
    if (!token) return;
    try {
      setError(null);
      setSuccess(null);
      await updateCaptionPublic(token, caption.id, isPublic);
      setRows((current) =>
        current.map((row) => (row.id === caption.id ? { ...row, is_public: isPublic } : row)),
      );
      setSuccess(`Updated visibility for caption ${shortId(caption.id)}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Caption update failed.");
    }
  };

  const save = async () => {
    if (!token || !drawer) return;

    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      validateRequiredFields(CAPTION_FIELDS, form);

      const payload = {
        profile_id: form.profile_id.trim(),
        image_id: form.image_id.trim(),
        content: form.content.trim(),
        is_public: form.is_public === "true",
      };

      if (drawer.mode === "create") {
        await insertTableRow(token, "captions", payload);
        setSuccess("Created caption row.");
        setDrawer(null);
        await load(1);
        return;
      }

      if (drawer.mode === "edit") {
        await updateTableRowByField(token, "captions", "id", drawer.caption.id, payload);
        setSuccess(`Saved caption ${shortId(drawer.caption.id)}.`);
        setDrawer(null);
        await load(page);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to save caption.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (caption: CaptionRow) => {
    if (!token) return;
    if (!window.confirm(`Delete caption ${caption.id}?`)) return;

    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      await deleteCaption(token, caption.id);
      setSuccess(`Deleted caption ${shortId(caption.id)}.`);
      await load(rows.length === 1 && page > 1 ? page - 1 : page);
      setDrawer((current) => (current?.mode && "caption" in current && current.caption.id === caption.id ? null : current));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete caption.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pageContent">
      <PageHeader
        eyebrow="Core entity"
        title="Captions"
        description="Review caption text with the actual image preview instead of raw image IDs."
        actions={
          <div className="headerActions">
            <button type="button" className="secondaryButton" onClick={() => void load(page)}>
              Refresh
            </button>
            <button type="button" className="primaryButton" onClick={openCreate}>
              Create caption
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
            placeholder="Search caption text, image id, profile id, or linked image URL"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="supporting">{filteredRows.length} results on this page</p>
        </div>

        {loading ? (
          <div className="tableLoading">Loading captions…</div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No captions found"
            description="Create a caption or adjust the current search."
            action={
              <button type="button" className="primaryButton" onClick={openCreate}>
                Create caption
              </button>
            }
          />
        ) : (
          <div className="tableCard">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Caption</th>
                  <th>Metadata</th>
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const image = imagesById[row.image_id];
                  return (
                    <tr key={row.id}>
                      <td>
                        {image?.url ? (
                          <div className="thumbCell">
                            <img src={image.url} alt="" className="tableThumb" />
                          </div>
                        ) : (
                          <div className="thumbPlaceholder">No image</div>
                        )}
                      </td>
                      <td>
                        <div className="cellTitle">{row.content}</div>
                        <div className="cellSubtle">Caption {shortId(row.id)}</div>
                      </td>
                      <td>
                        <div className="cellSubtle">Image {shortId(row.image_id)}</div>
                        <div className="cellSubtle">Owner {shortId(row.profile_id)}</div>
                        <div className="cellSubtle">Likes {row.like_count ?? 0}</div>
                        <div className="cellSubtle">{formatDate(row.created_datetime_utc)}</div>
                      </td>
                      <td>
                        <BooleanChoice
                          value={Boolean(row.is_public)}
                          onChange={(nextValue) => void togglePublic(row, nextValue)}
                          trueLabel="Public"
                          falseLabel="Private"
                          compact
                        />
                      </td>
                      <td>
                        <div className="rowActions">
                          <button type="button" className="secondaryButton" onClick={() => setDrawer({ mode: "view", caption: row })}>
                            View
                          </button>
                          <button type="button" className="secondaryButton" onClick={() => openEdit(row)}>
                            Edit
                          </button>
                          <button type="button" className="dangerButton" onClick={() => void remove(row)} disabled={busy}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination current={page} total={totalPages} onChange={(nextPage) => void load(nextPage)} />
      </section>

      {drawer?.mode === "view" && (
        <Modal title="Caption details" subtitle={drawer.caption.id} onClose={() => setDrawer(null)}>
          {imagesById[drawer.caption.image_id]?.url ? (
            <div className="detailMedia detailMediaViewer">
              <img src={imagesById[drawer.caption.image_id].url} alt="" className="detailImage" />
            </div>
          ) : null}
          <dl className="detailGrid">
            <div>
              <dt>Caption</dt>
              <dd>{drawer.caption.content}</dd>
            </div>
            <div>
              <dt>Image ID</dt>
              <dd>{drawer.caption.image_id}</dd>
            </div>
            <div>
              <dt>Profile ID</dt>
              <dd>{drawer.caption.profile_id}</dd>
            </div>
            <div>
              <dt>Public</dt>
              <dd>{drawer.caption.is_public ? "true" : "false"}</dd>
            </div>
            <div>
              <dt>Likes</dt>
              <dd>{drawer.caption.like_count ?? 0}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(drawer.caption.created_datetime_utc)}</dd>
            </div>
            {imagesById[drawer.caption.image_id]?.url && (
              <div>
                <dt>Image URL</dt>
                <dd>{imagesById[drawer.caption.image_id].url}</dd>
              </div>
            )}
          </dl>
        </Modal>
      )}

      {(drawer?.mode === "create" || drawer?.mode === "edit") && (
        <Modal
          title={drawer.mode === "create" ? "Create caption" : "Edit caption"}
          subtitle={drawer.mode === "edit" ? drawer.caption.id : "Add a new caption row"}
          onClose={() => setDrawer(null)}
        >
          {formImage?.url && (
            <div className="uploadPreviewLayout">
              <div className="detailMedia detailMediaLarge">
                <img src={formImage.url} alt="" className="detailImage" />
              </div>
              <div className="detailGrid detailGridCompact">
                <div>
                  <dt>Linked image</dt>
                  <dd>{formImage.id}</dd>
                </div>
                <div>
                  <dt>Image URL</dt>
                  <dd>{formImage.url}</dd>
                </div>
              </div>
            </div>
          )}
          <div className="formGrid">
            <label className="field">
              <span>Profile ID</span>
              <input
                className="textInput"
                type="text"
                value={form.profile_id ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, profile_id: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Image ID</span>
              <input
                className="textInput"
                type="text"
                value={form.image_id ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, image_id: event.target.value }))}
              />
            </label>
            <label className="field fieldFull">
              <span>Caption</span>
              <textarea
                className="textArea"
                value={form.content ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Visibility</span>
              <BooleanChoice
                value={form.is_public !== "false"}
                onChange={(nextValue) => setForm((current) => ({ ...current, is_public: nextValue ? "true" : "false" }))}
                trueLabel="Public"
                falseLabel="Private"
              />
            </label>
          </div>

          <div className="drawerActions">
            <button type="button" className="primaryButton" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving..." : drawer.mode === "create" ? "Create caption" : "Save changes"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
