"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { buildImageLoadFailureMessage, supportedImageFormatsLabel } from "@/lib/admin-images";

function joinClassNames(...values: Array<string | null | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

type ImageStatus = "empty" | "loading" | "loaded" | "error";

export function AdminImage({
  src,
  alt,
  wrapperClassName,
  imageClassName,
  fit = "contain",
  loading = "lazy",
  compact = false,
  fallbackTitle,
  fallbackHint,
}: {
  src?: string | null;
  alt: string;
  wrapperClassName?: string;
  imageClassName?: string;
  fit?: "contain" | "cover";
  loading?: "eager" | "lazy";
  compact?: boolean;
  fallbackTitle?: string;
  fallbackHint?: string;
}) {
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const status: ImageStatus = !src ? "empty" : failedSource === src ? "error" : loadedSource === src ? "loaded" : "loading";

  const resolvedTitle = status === "empty" ? fallbackTitle ?? "No image" : fallbackTitle ?? "Image unavailable";
  const resolvedHint = useMemo(
    () =>
      fallbackHint ??
      (src
        ? buildImageLoadFailureMessage(src)
        : `Use a supported image source such as ${supportedImageFormatsLabel()}, or add a valid public image URL.`),
    [fallbackHint, src],
  );

  return (
    <div
      className={joinClassNames("adminImageRoot", compact && "adminImageRootCompact", wrapperClassName)}
      data-fit={fit}
      data-status={status}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt={alt}
          className={joinClassNames("adminImageElement", imageClassName)}
          loading={loading}
          decoding="async"
          onLoad={() => {
            setLoadedSource(src);
            setFailedSource((current) => (current === src ? null : current));
          }}
          onError={() => setFailedSource(src)}
        />
      ) : null}

      {status !== "loaded" && (
        <div className={joinClassNames("adminImageFallback", compact && "adminImageFallbackCompact")}>
          {status === "loading" ? (
            <>
              <span className="adminImageSpinner" aria-hidden="true" />
              {!compact && <span className="adminImageFallbackTitle">Loading image...</span>}
            </>
          ) : (
            <>
              <span className="adminImageFallbackTitle">{resolvedTitle}</span>
              {!compact && <span className="adminImageFallbackHint">{resolvedHint}</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
