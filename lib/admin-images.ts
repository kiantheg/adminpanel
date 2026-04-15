export type ImageFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "svg"
  | "bmp"
  | "avif"
  | "heic"
  | "heif"
  | "unknown";

const FORMAT_LABELS: Record<Exclude<ImageFormat, "unknown">, string> = {
  avif: "AVIF",
  bmp: "BMP",
  gif: "GIF",
  heic: "HEIC",
  heif: "HEIF",
  jpeg: "JPG / JPEG",
  png: "PNG",
  svg: "SVG",
  webp: "WEBP",
};

const MIME_TO_FORMAT: Record<string, ImageFormat> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heic-sequence": "heic",
  "image/heif": "heif",
  "image/heif-sequence": "heif",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

const EXTENSION_TO_FORMAT: Record<string, ImageFormat> = {
  avif: "avif",
  bmp: "bmp",
  gif: "gif",
  heic: "heic",
  heics: "heic",
  heif: "heif",
  heifs: "heif",
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  svg: "svg",
  webp: "webp",
};

const SUPPORTED_FORMATS = new Set<ImageFormat>(["jpeg", "png", "webp", "gif", "svg", "bmp", "avif", "heic", "heif"]);
const CONVERTIBLE_FORMATS = new Set<ImageFormat>(["heic", "heif"]);
const BINARY_SIGNATURE_LENGTH = 64;
const SVG_SNIFF_LENGTH = 768;
const PROBE_TIMEOUT_MS = 10000;

function ascii(bytes: Uint8Array) {
  return String.fromCharCode(...bytes);
}

function normalizeTextStart(value: string) {
  return value.replace(/^\uFEFF/, "").trimStart().toLowerCase();
}

function looksLikeSvg(value: string) {
  const text = normalizeTextStart(value);
  return text.startsWith("<svg") || text.startsWith("<?xml") || text.includes("<svg");
}

function detectFormatFromBytes(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg" as const;
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png" as const;
  }

  if (bytes.length >= 6) {
    const gifHeader = ascii(bytes.slice(0, 6));
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
      return "gif" as const;
    }
  }

  if (bytes.length >= 12 && ascii(bytes.slice(0, 4)) === "RIFF" && ascii(bytes.slice(8, 12)) === "WEBP") {
    return "webp" as const;
  }

  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "bmp" as const;
  }

  if (bytes.length >= 12 && ascii(bytes.slice(4, 8)) === "ftyp") {
    const brand = ascii(bytes.slice(8, 12));
    if (brand === "avif" || brand === "avis") {
      return "avif" as const;
    }
    if (brand === "heic" || brand === "heix" || brand === "hevc" || brand === "hevx") {
      return "heic" as const;
    }
    if (brand === "mif1" || brand === "msf1") {
      return "heif" as const;
    }
  }

  return "unknown" as const;
}

function extensionFromPath(path: string) {
  const cleaned = path.split("?")[0]?.split("#")[0] ?? path;
  const filename = cleaned.split("/").filter(Boolean).pop() ?? "";
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

export function supportedImageFormatsLabel() {
  return "JPG, JPEG, PNG, WEBP, GIF, SVG, BMP, AVIF";
}

export function supportedImageUploadAccept() {
  return [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "image/bmp",
    "image/avif",
    "image/heic",
    "image/heif",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".svg",
    ".bmp",
    ".avif",
    ".heic",
    ".heif",
    ".heics",
    ".heifs",
  ].join(",");
}

export function getImageFormatLabel(format: ImageFormat) {
  return format === "unknown" ? "Unknown image type" : FORMAT_LABELS[format];
}

export function inferImageFormatFromMime(mimeType: string | null | undefined) {
  if (!mimeType) return "unknown";
  return MIME_TO_FORMAT[mimeType.trim().toLowerCase()] ?? "unknown";
}

export function inferImageFormatFromExtension(path: string | null | undefined) {
  if (!path) return "unknown";
  return EXTENSION_TO_FORMAT[extensionFromPath(path)] ?? "unknown";
}

export function inferImageFormatFromUrl(value: string | null | undefined) {
  if (!value) return "unknown";

  if (value.startsWith("data:")) {
    const mime = value.slice(5).split(/[;,]/, 1)[0] ?? "";
    return inferImageFormatFromMime(mime);
  }

  if (value.startsWith("blob:")) {
    return "unknown";
  }

  try {
    return inferImageFormatFromExtension(new URL(value).pathname);
  } catch {
    return inferImageFormatFromExtension(value);
  }
}

export async function detectImageFormatFromFile(file: File) {
  const mimeFormat = inferImageFormatFromMime(file.type);
  const bytes = new Uint8Array(await file.slice(0, BINARY_SIGNATURE_LENGTH).arrayBuffer());
  const signatureFormat = detectFormatFromBytes(bytes);

  if (signatureFormat !== "unknown") {
    return signatureFormat;
  }

  if (mimeFormat === "svg") {
    return "svg";
  }

  const maybeSvg = await file.slice(0, SVG_SNIFF_LENGTH).text().catch(() => "");
  if (looksLikeSvg(maybeSvg)) {
    return "svg";
  }

  if (mimeFormat !== "unknown") {
    return mimeFormat;
  }

  return inferImageFormatFromExtension(file.name);
}

export function normalizeRemoteImageUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Image URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Enter a valid image URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Image URLs must start with http:// or https://.");
  }

  return parsed.toString();
}

export async function probeImageSource(source: string) {
  if (typeof Image === "undefined") {
    throw new Error("Image probing is only available in the browser.");
  }

  return await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out while loading the image."));
    }, PROBE_TIMEOUT_MS);

    image.decoding = "async";
    image.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(new Error("The image could not be loaded."));
    };
    image.src = source;
  });
}

export function buildImageLoadFailureMessage(source: string | null | undefined) {
  const format = inferImageFormatFromUrl(source);
  if (format === "heic" || format === "heif") {
    return `${getImageFormatLabel(format)} images are not reliably displayable in this browser. Convert the file to ${supportedImageFormatsLabel()}.`;
  }

  return "The image could not be loaded. Check that the source points to a public image file, or convert it to JPG, PNG, WEBP, GIF, SVG, BMP, or AVIF.";
}

export async function validateImageFile(file: File) {
  const format = await detectImageFormatFromFile(file);

  if (!SUPPORTED_FORMATS.has(format)) {
    return {
      ok: false as const,
      error: `Unsupported image type. Use ${supportedImageFormatsLabel()}. HEIC/HEIF files are only accepted when the current browser can actually render them.`,
      format,
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    await probeImageSource(objectUrl);
  } catch {
    if (CONVERTIBLE_FORMATS.has(format)) {
      return {
        ok: false as const,
        error: `${getImageFormatLabel(format)} is not currently displayable here. Convert the image to ${supportedImageFormatsLabel()}.`,
        format,
      };
    }

    return {
      ok: false as const,
      error: `This ${getImageFormatLabel(format)} file could not be previewed in the current browser. Convert it to JPG, PNG, WEBP, GIF, SVG, BMP, or AVIF.`,
      format,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return {
    ok: true as const,
    format,
    label: getImageFormatLabel(format),
  };
}

export async function validateRemoteImageUrl(value: string) {
  const normalized = normalizeRemoteImageUrl(value);

  try {
    await probeImageSource(normalized);
  } catch {
    throw new Error(buildImageLoadFailureMessage(normalized));
  }

  return {
    url: normalized,
    format: inferImageFormatFromUrl(normalized),
  };
}
