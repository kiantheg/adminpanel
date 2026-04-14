"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { ImageUploadModal } from "@/components/admin/image-upload-modal";
import { BooleanChoice, EmptyState, Modal, PageHeader, Pagination, StatusBanner } from "@/components/admin/ui";
import { formatDate, initFormState, shortId, validateRequiredFields } from "@/lib/admin-ui";
import {
  deleteImage,
  listCaptionExamplesByImageIds,
  listCaptionsByImageIds,
  listImages,
  updateImagePublic,
  updateTableRowByField,
  type CaptionRow,
  type GenericRow,
  type ImageRow,
} from "@/lib/supabase-rest";

const PAGE_SIZE = 12;
const IMAGE_FIELDS = [
  { name: "profile_id", label: "Profile ID", required: true },
  { name: "url", label: "Image URL", required: true },
  { name: "is_public", label: "Public", type: "boolean" as const },
];

type ImageDrawerState =
  | { mode: "upload" }
  | { mode: "view"; image: ImageRow }
  | { mode: "edit"; image: ImageRow }
  | null;

type LinkedCaption = {
  id: string;
  text: string;
  source: "caption" | "example";
  createdAt?: string | null;
  likeCount?: number | null;
  priority?: number | null;
};

export function ImagesPage() {
  const { me, token } = useAdmin();
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [captionsByImageId, setCaptionsByImageId] = useState<Record<string, LinkedCaption[]>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<ImageDrawerState>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
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
      const images = await listImages(token, nextPage, PAGE_SIZE);
      setRows(images.rows);
      setTotal(images.total);
      setPage(images.page);

      const imageIds = images.rows.map((row) => row.id);
      const [captionRows, exampleRows] = await Promise.all([
        listCaptionsByImageIds(token, imageIds),
        listCaptionExamplesByImageIds(token, imageIds),
      ]);

      const mapped: Record<string, LinkedCaption[]> = {};
      for (const row of captionRows) {
        const captionRow = row as CaptionRow;
        const caption = captionRow.content;
        if (!mapped[row.image_id]) mapped[row.image_id] = [];
        if (caption) {
          mapped[row.image_id].push({
            id: captionRow.id,
            text: caption,
            source: "caption",
            createdAt: captionRow.created_datetime_utc,
            likeCount: captionRow.like_count,
          });
        }
      }
      for (const row of exampleRows) {
        const imageId = String(row.image_id ?? "");
        const caption = typeof row.caption === "string" ? row.caption : "";
        if (!imageId || !caption) continue;
        if (!mapped[imageId]) mapped[imageId] = [];
        mapped[imageId].push({
          id: String(row.id ?? caption),
          text: caption,
          source: "example",
          createdAt: typeof row.modified_datetime_utc === "string" ? row.modified_datetime_utc : null,
          priority: typeof row.priority === "number" ? row.priority : null,
        });
      }

      setCaptionsByImageId(mapped);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load images.");
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
      const captions = (captionsByImageId[row.id] ?? [])
        .map((caption) => caption.text)
        .join(" ")
        .toLowerCase();
      return (
        row.id.toLowerCase().includes(normalized) ||
        row.profile_id.toLowerCase().includes(normalized) ||
        row.url.toLowerCase().includes(normalized) ||
        captions.includes(normalized)
      );
    });
  }, [captionsByImageId, query, rows]);

  const openEdit = (image: ImageRow) => {
    setEditForm(initFormState(IMAGE_FIELDS, image as unknown as GenericRow));
    setDrawer({ mode: "edit", image });
  };

  const togglePublic = async (image: ImageRow, isPublic: boolean) => {
    if (!token) return;

    try {
      setError(null);
      setSuccess(null);
      await updateImagePublic(token, image.id, isPublic);
      setRows((current) => current.map((row) => (row.id === image.id ? { ...row, is_public: isPublic } : row)));
      setDrawer((current) =>
        current?.mode && "image" in current && current.image.id === image.id
          ? { ...current, image: { ...current.image, is_public: isPublic } }
          : current,
      );
      setSuccess(`Updated visibility for image ${shortId(image.id)}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Image update failed.");
    }
  };

  const saveImage = async () => {
    if (!token || drawer?.mode !== "edit") return;

    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      validateRequiredFields(IMAGE_FIELDS, editForm);
      await updateTableRowByField(token, "images", "id", drawer.image.id, {
        profile_id: editForm.profile_id.trim(),
        url: editForm.url.trim(),
        is_public: editForm.is_public === "true",
      });
      setSuccess(`Saved image ${shortId(drawer.image.id)}.`);
      setDrawer(null);
      await load(page);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to save image.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (image: ImageRow) => {
    if (!token) return;
    if (!window.confirm(`Delete image row ${image.id}?`)) return;

    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      await deleteImage(token, image.id);
      setSuccess(`Deleted image ${shortId(image.id)}.`);
      await load(rows.length === 1 && page > 1 ? page - 1 : page);
      setDrawer((current) => (current?.mode && "image" in current && current.image.id === image.id ? null : current));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete image.");
    } finally {
      setBusy(false);
    }
  };

  const editPreviewUrl = drawer?.mode === "edit" ? editForm.url?.trim() || drawer.image.url : null;

  return (
    <div className="pageContent">
      <PageHeader
        eyebrow="Core entity"
        title="Image management"
        description="Upload, inspect, edit, and delete image rows with actual previews and linked caption context."
        actions={
          <div className="headerActions">
            <button type="button" className="secondaryButton" onClick={() => void load(page)}>
              Refresh
            </button>
            <button type="button" className="primaryButton" onClick={() => setDrawer({ mode: "upload" })}>
              Upload image
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
            placeholder="Search image id, owner id, URL, or caption text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="supporting">{filteredRows.length} results on this page</p>
        </div>

        {loading ? (
          <div className="tableLoading">Loading images…</div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No images found"
            description="Upload a new image or adjust the current search."
            action={
              <button type="button" className="primaryButton" onClick={() => setDrawer({ mode: "upload" })}>
                Upload image
              </button>
            }
          />
        ) : (
          <div className="tableCard">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Image</th>
                  <th>Linked captions</th>
                  <th>Visibility</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const linkedCaptions = captionsByImageId[row.id] ?? [];
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="thumbCell">
                          <img src={row.url} alt="" className="tableThumb" />
                        </div>
                      </td>
                      <td>
                        <div className="cellTitle">{shortId(row.id)}</div>
                        <div className="cellSubtle">Owner {shortId(row.profile_id)}</div>
                      </td>
                      <td>
                        {linkedCaptions.length > 0 ? (
                          <div className="captionStack">
                            {linkedCaptions.slice(0, 2).map((caption) => (
                              <p key={caption.id} className="captionPreview">
                                {caption.text}
                              </p>
                            ))}
                            {linkedCaptions.length > 2 && (
                              <p className="cellSubtle">+{linkedCaptions.length - 2} more captions</p>
                            )}
                          </div>
                        ) : (
                          <span className="cellSubtle">No linked captions</span>
                        )}
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
                      <td>{formatDate(row.created_datetime_utc)}</td>
                      <td>
                        <div className="rowActions">
                          <button type="button" className="secondaryButton" onClick={() => setDrawer({ mode: "view", image: row })}>
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

      {drawer?.mode === "upload" && (
        <ImageUploadModal
          initialProfileId={me?.id}
          onClose={() => setDrawer(null)}
          onUploaded={async (message) => {
            setSuccess(message);
            await load(1);
          }}
        />
      )}

      {drawer?.mode === "view" && (
        <Modal title="Image details" subtitle={drawer.image.url} onClose={() => setDrawer(null)}>
          <div className="detailMedia detailMediaViewer">
            <img src={drawer.image.url} alt="" className="detailImage" />
          </div>
          <dl className="detailGrid">
            <div>
              <dt>Image ID</dt>
              <dd>{drawer.image.id}</dd>
            </div>
            <div>
              <dt>Profile ID</dt>
              <dd>{drawer.image.profile_id}</dd>
            </div>
            <div>
              <dt>Visibility</dt>
              <dd>{drawer.image.is_public ? "Public" : "Private"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(drawer.image.created_datetime_utc)}</dd>
            </div>
            <div>
              <dt>Filename</dt>
              <dd>{drawer.image.url.split("/").filter(Boolean).pop() ?? "-"}</dd>
            </div>
            <div>
              <dt>Image URL</dt>
              <dd>{drawer.image.url}</dd>
            </div>
          </dl>
          <div className="linkedPanel">
            <h3>Linked captions</h3>
            {(captionsByImageId[drawer.image.id] ?? []).length === 0 ? (
              <p className="supporting">No captions found for this image.</p>
            ) : (
              <div className="linkedCaptionList">
                {(captionsByImageId[drawer.image.id] ?? []).map((caption) => (
                  <article key={caption.id} className="linkedCaptionCard">
                    <div className="linkedCaptionHeader">
                      <span className="linkedCaptionBadge">
                        {caption.source === "caption" ? "Published caption" : "Example caption"}
                      </span>
                      {caption.likeCount !== null && caption.likeCount !== undefined ? (
                        <span className="cellSubtle">{caption.likeCount} likes</span>
                      ) : caption.priority !== null && caption.priority !== undefined ? (
                        <span className="cellSubtle">Priority {caption.priority}</span>
                      ) : null}
                    </div>
                    <p className="linkedCaptionText">{caption.text}</p>
                    {caption.createdAt && <p className="cellSubtle">{formatDate(caption.createdAt)}</p>}
                  </article>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {drawer?.mode === "edit" && (
        <Modal title="Edit image row" subtitle={drawer.image.id} onClose={() => setDrawer(null)}>
          {editPreviewUrl && (
            <div className="uploadPreviewLayout">
              <div className="detailMedia detailMediaLarge">
                <img src={editPreviewUrl} alt="" className="detailImage" />
              </div>
              <div className="detailGrid detailGridCompact">
                <div>
                  <dt>Current image</dt>
                  <dd>This preview reflects the URL currently stored in the row.</dd>
                </div>
                <div>
                  <dt>Filename</dt>
                  <dd>{editPreviewUrl.split("/").filter(Boolean).pop() ?? "-"}</dd>
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
                value={editForm.profile_id ?? ""}
                onChange={(event) => setEditForm((current) => ({ ...current, profile_id: event.target.value }))}
              />
            </label>
            <label className="field fieldFull">
              <span>Image URL</span>
              <input
                className="textInput"
                type="url"
                value={editForm.url ?? ""}
                onChange={(event) => setEditForm((current) => ({ ...current, url: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Visibility</span>
              <BooleanChoice
                value={editForm.is_public === "true"}
                onChange={(nextValue) =>
                  setEditForm((current) => ({ ...current, is_public: nextValue ? "true" : "false" }))
                }
                trueLabel="Public"
                falseLabel="Private"
              />
            </label>
          </div>

          <div className="drawerActions">
            <button type="button" className="primaryButton" onClick={() => void saveImage()} disabled={busy}>
              {busy ? "Saving..." : "Save changes"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
