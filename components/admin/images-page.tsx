"use client";

import { useCallback, useState } from "react";
import { AdminImage } from "@/components/admin/admin-image";
import { useAdmin } from "@/components/admin/admin-provider";
import { ImageUploadModal } from "@/components/admin/image-upload-modal";
import { useAdminTableController } from "@/components/admin/use-admin-table-controller";
import { BooleanChoice, EmptyState, Modal, PageHeader, Pagination, StatusBanner } from "@/components/admin/ui";
import { validateRemoteImageUrl } from "@/lib/admin-images";
import { formatDate, initFormState, matchesSearchQuery, shortId, validateRequiredFields } from "@/lib/admin-ui";
import {
  deleteImage,
  listAllCaptions,
  listAllImages,
  listAllTableRows,
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

type CaptionExampleRow = GenericRow & {
  id?: string | number;
  image_id?: string;
  caption?: string;
  priority?: number | null;
  modified_datetime_utc?: string | null;
};

function buildLinkedCaptionsMap(captionRows: CaptionRow[], exampleRows: CaptionExampleRow[]) {
  const mapped: Record<string, LinkedCaption[]> = {};

  for (const row of captionRows) {
    if (!mapped[row.image_id]) mapped[row.image_id] = [];
    mapped[row.image_id].push({
      id: row.id,
      text: row.content,
      source: "caption",
      createdAt: row.created_datetime_utc,
      likeCount: row.like_count,
    });
  }

  for (const row of exampleRows) {
    const imageId = typeof row.image_id === "string" ? row.image_id : "";
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

  return mapped;
}

export function ImagesPage() {
  const { me, token } = useAdmin();
  const [drawer, setDrawer] = useState<ImageDrawerState>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPage = useCallback(async (nextPage: number) => {
    if (!token) {
      return { rows: [], total: 0, page: 1, extra: {} as Record<string, LinkedCaption[]> };
    }

    const images = await listImages(token, nextPage, PAGE_SIZE);
    const imageIds = images.rows.map((row) => row.id);
    const [captionRows, exampleRows] = await Promise.all([
      listCaptionsByImageIds(token, imageIds),
      listCaptionExamplesByImageIds(token, imageIds),
    ]);

    return {
      rows: images.rows,
      total: images.total,
      page: images.page,
      extra: buildLinkedCaptionsMap(captionRows, exampleRows as CaptionExampleRow[]),
    };
  }, [token]);

  const fetchAll = useCallback(async () => {
    if (!token) {
      return { rows: [], extra: {} as Record<string, LinkedCaption[]> };
    }

    const [allImages, allCaptions, allExamples] = await Promise.all([
      listAllImages(token),
      listAllCaptions(token),
      listAllTableRows(
        token,
        "caption_examples",
        "id,image_id,caption,priority,modified_datetime_utc",
        "priority.asc.nullslast",
      ),
    ]);

    return {
      rows: allImages,
      extra: buildLinkedCaptionsMap(allCaptions, allExamples as CaptionExampleRow[]),
    };
  }, [token]);

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
    updateRows,
    refresh,
  } = useAdminTableController<ImageRow, Record<string, LinkedCaption[]>>({
    token,
    pageSize: PAGE_SIZE,
    loadErrorMessage: "Failed to load images.",
    fetchPage,
    fetchAll,
    filterRows: useCallback(
      (inputRows, currentQuery, captionsByImageId) =>
        inputRows.filter((row) =>
          matchesSearchQuery(
            {
              ...row,
              linked_captions: (captionsByImageId?.[row.id] ?? []).map((caption) => caption.text),
            },
            currentQuery,
          ),
        ),
      [],
    ),
  });
  const captionsByImageId = extra ?? {};

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
      updateRows((row) => (row.id === image.id ? { ...row, is_public: isPublic } : row));
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
      const { url: normalizedUrl } = await validateRemoteImageUrl(editForm.url.trim());
      await updateTableRowByField(token, "images", "id", drawer.image.id, {
        profile_id: editForm.profile_id.trim(),
        url: normalizedUrl,
        is_public: editForm.is_public === "true",
      });
      setSuccess(`Saved image ${shortId(drawer.image.id)}.`);
      setDrawer(null);
      refresh(currentPage);
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
      refresh(rows.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage);
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
            <button type="button" className="secondaryButton" onClick={() => refresh(currentPage)}>
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

      <section className="panelCard tablePanel">
        <div className="toolbar">
          <input
            className="searchInput"
            type="search"
            placeholder="Search any image id, owner id, URL, or linked caption match"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="supporting">
            {searchActive
              ? `${total} matching image result${total === 1 ? "" : "s"}`
              : `${total} total image${total === 1 ? "" : "s"}`}
          </p>
        </div>

        {loading ? (
          <div className="tableLoading">Loading images…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={searchActive ? "No matching images" : "No images found"}
            description={
              searchActive ? "Try a broader search or clear the current query." : "Upload a new image to populate this table."
            }
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
                {rows.map((row) => {
                  const linkedCaptions = captionsByImageId[row.id] ?? [];
                  return (
                    <tr key={row.id}>
                      <td>
                        <AdminImage
                          src={row.url}
                          alt={`Image ${shortId(row.id)}`}
                          wrapperClassName="tableThumb"
                          compact
                        />
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

        <Pagination current={currentPage} total={totalPages} onChange={setPage} />
      </section>

      {drawer?.mode === "upload" && (
        <ImageUploadModal
          initialProfileId={me?.id}
          onClose={() => setDrawer(null)}
          onUploaded={async (message) => {
            setSuccess(message);
            refresh(1);
          }}
        />
      )}

      {drawer?.mode === "view" && (
        <Modal title="Image details" subtitle={drawer.image.url} onClose={() => setDrawer(null)}>
          <div className="detailMedia detailMediaViewer">
            <AdminImage
              src={drawer.image.url}
              alt={`Image ${drawer.image.id}`}
              wrapperClassName="adminImageStage"
              imageClassName="detailImage"
              fit="contain"
              loading="eager"
              fallbackTitle="Image preview unavailable"
            />
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
                <AdminImage
                  src={editPreviewUrl}
                  alt={`Preview for ${drawer.image.id}`}
                  wrapperClassName="adminImageStage"
                  imageClassName="detailImage"
                  fit="contain"
                  loading="eager"
                  fallbackTitle="Preview unavailable"
                />
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
