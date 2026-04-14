"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { BooleanChoice, Modal, StatusBanner } from "@/components/admin/ui";
import { missingSupabaseMessage, supabase } from "@/lib/supabase-browser";
import { insertTableRow } from "@/lib/supabase-rest";

type UploadMode = "file" | "url";

function fileNameFromUrl(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.split("/").filter(Boolean).pop() ?? value;
  } catch {
    return value;
  }
}

type ImageUploadModalProps = {
  title?: string;
  subtitle?: string;
  initialProfileId?: string | null;
  onClose: () => void;
  onUploaded?: (message: string) => Promise<void> | void;
};

export function ImageUploadModal({
  title = "Upload image",
  subtitle = "Add an image from your device or save an external image URL.",
  initialProfileId,
  onClose,
  onUploaded,
}: ImageUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { token } = useAdmin();
  const [mode, setMode] = useState<UploadMode>("file");
  const [profileId, setProfileId] = useState(initialProfileId ?? "");
  const [visibility, setVisibility] = useState("true");
  const [prefix, setPrefix] = useState("admin");
  const [urlValue, setUrlValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProfileId && !profileId.trim()) {
      setProfileId(initialProfileId);
    }
  }, [initialProfileId, profileId]);

  useEffect(() => {
    if (!selectedFile) {
      setFilePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setFilePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const previewSrc = useMemo(() => {
    if (mode === "file") {
      return filePreviewUrl;
    }
    return urlValue.trim() || null;
  }, [filePreviewUrl, mode, urlValue]);

  const previewName = useMemo(() => {
    if (mode === "file") {
      return selectedFile?.name ?? null;
    }
    return urlValue.trim() ? fileNameFromUrl(urlValue.trim()) : null;
  }, [mode, selectedFile, urlValue]);

  const clearTransientState = () => {
    setError(null);
    setProgress(0);
    setProgressLabel(null);
  };

  const handleFileSelection = (file: File | null) => {
    setSelectedFile(file);
    setMode("file");
    clearTransientState();
  };

  const handleSubmit = async () => {
    if (!token) {
      setError("No session token found. Sign in again.");
      return;
    }
    if (!profileId.trim()) {
      setError("Profile ID is required.");
      return;
    }

    try {
      clearTransientState();
      setBusy(true);

      if (mode === "url") {
        const normalizedUrl = urlValue.trim();
        if (!normalizedUrl) {
          throw new Error("Image URL is required.");
        }
        new URL(normalizedUrl);

        setProgress(35);
        setProgressLabel("Creating image row from external URL...");
        await insertTableRow(token, "images", {
          profile_id: profileId.trim(),
          url: normalizedUrl,
          is_public: visibility === "true",
        });
        setProgress(100);
        setProgressLabel("Image row created.");
        const message = "Image saved from URL.";
        await onUploaded?.(message);
        onClose();
        return;
      }

      if (!supabase) {
        throw new Error(missingSupabaseMessage);
      }
      if (!selectedFile) {
        throw new Error("Choose an image file or drop one into the upload area.");
      }

      const bucket = process.env.NEXT_PUBLIC_IMAGE_BUCKET || "images";
      const safePrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const objectPath = `${safePrefix ? `${safePrefix}/` : ""}${Date.now()}-${safeName}`;

      setProgress(15);
      setProgressLabel("Preparing upload...");

      setProgress(55);
      setProgressLabel("Uploading file to storage...");
      const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, selectedFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: selectedFile.type || undefined,
      });
      if (uploadError) {
        throw uploadError;
      }

      setProgress(80);
      setProgressLabel("Creating image row...");
      const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      await insertTableRow(token, "images", {
        profile_id: profileId.trim(),
        url: data.publicUrl,
        is_public: visibility === "true",
      });

      setProgress(100);
      setProgressLabel("Upload complete.");
      const message = "Image uploaded successfully.";
      await onUploaded?.(message);
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} canDismiss={!busy}>
      <div className="uploadModeSwitch" role="tablist" aria-label="Image upload method">
        <button
          type="button"
          className={mode === "file" ? "uploadModeButton uploadModeButtonActive" : "uploadModeButton"}
          onClick={() => setMode("file")}
        >
          File upload
        </button>
        <button
          type="button"
          className={mode === "url" ? "uploadModeButton uploadModeButtonActive" : "uploadModeButton"}
          onClick={() => setMode("url")}
        >
          Image URL
        </button>
      </div>

      <StatusBanner kind="error" message={error} onDismiss={() => setError(null)} />

      <div className="formGrid">
        <label className="field">
          <span>Profile ID</span>
          <input className="textInput" type="text" value={profileId} onChange={(event) => setProfileId(event.target.value)} />
        </label>
        <label className="field">
          <span>Visibility</span>
          <BooleanChoice
            value={visibility === "true"}
            onChange={(nextValue) => setVisibility(nextValue ? "true" : "false")}
            trueLabel="Public"
            falseLabel="Private"
          />
        </label>
        {mode === "file" && (
          <label className="field">
            <span>Storage prefix</span>
            <input className="textInput" type="text" value={prefix} onChange={(event) => setPrefix(event.target.value)} />
          </label>
        )}
        {mode === "url" && (
          <label className="field fieldFull">
            <span>Image URL</span>
            <input className="textInput" type="url" value={urlValue} onChange={(event) => setUrlValue(event.target.value)} />
          </label>
        )}
      </div>

      {mode === "file" && (
        <div
          className={dragActive ? "dropZone dropZoneActive" : "dropZone"}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            handleFileSelection(event.dataTransfer.files?.[0] ?? null);
          }}
        >
          <p className="dropZoneTitle">Drag and drop an image here</p>
          <p className="supporting">or choose a file from your device.</p>
          <div className="dropZoneActions">
            <button type="button" className="secondaryButton" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </button>
            {selectedFile && <span className="supporting">{selectedFile.name}</span>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hiddenInput"
            onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {(busy || progressLabel) && (
        <div className="uploadStatusCard">
          <div className="uploadStatusTop">
            <strong>{progressLabel ?? "Starting upload..."}</strong>
            <span>{progress}%</span>
          </div>
          <div className="progressBarTrack" aria-hidden="true">
            <span className="progressBarFill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {previewSrc && (
        <div className="uploadPreviewLayout">
          <div className="detailMedia detailMediaLarge">
            <img src={previewSrc} alt={previewName ?? "Image preview"} className="detailImage" />
          </div>
          <div className="detailGrid detailGridCompact">
            <div>
              <dt>Source</dt>
              <dd>{mode === "file" ? "Local file upload" : "External image URL"}</dd>
            </div>
            {previewName && (
              <div>
                <dt>{mode === "file" ? "Filename" : "Resolved name"}</dt>
                <dd>{previewName}</dd>
              </div>
            )}
            {mode === "file" && selectedFile && (
              <>
                <div>
                  <dt>File type</dt>
                  <dd>{selectedFile.type || "Unknown"}</dd>
                </div>
                <div>
                  <dt>File size</dt>
                  <dd>{Math.round(selectedFile.size / 1024)} KB</dd>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="modalActions">
        <button type="button" className="secondaryButton" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="primaryButton" onClick={() => void handleSubmit()} disabled={busy}>
          {busy ? "Uploading..." : mode === "file" ? "Upload image" : "Save image URL"}
        </button>
      </div>
    </Modal>
  );
}
