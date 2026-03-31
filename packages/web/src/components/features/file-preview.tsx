import { useEffect, useState, useCallback, useRef } from "react";
import {
  X,
  Download,
  Loader2,
  FileText,
  FileImage,
  FileVideo2,
  FileAudio,
  File,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { FileRecord } from "@hcc/shared";
import { getAccessToken } from "@/lib/api";

interface FilePreviewProps {
  file: FileRecord | null;
  open: boolean;
  onClose: () => void;
}

type PreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "unsupported";

function resolveKind(mime: string): PreviewKind {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/x-yaml" ||
    mime === "application/x-sh"
  )
    return "text";
  return "unsupported";
}

function kindIcon(kind: PreviewKind) {
  switch (kind) {
    case "image":
      return FileImage;
    case "video":
      return FileVideo2;
    case "audio":
      return FileAudio;
    case "text":
    case "pdf":
      return FileText;
    default:
      return File;
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePreviewModal({ file, open, onClose }: FilePreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const kind = file ? resolveKind(file.mime_type) : "unsupported";

  const cleanup = useCallback(() => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setTextContent(null);
    setError(null);
    setLoading(false);
    setZoom(1);
    setRotation(0);
    setIsFullscreen(false);
  }, [blobUrl]);

  useEffect(() => {
    if (!open || !file) {
      cleanup();
      return;
    }

    if (kind === "unsupported") return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`/api/v1/files/${file.id}/download`, {
      headers,
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);

        if (kind === "text") {
          const text = await res.text();
          setTextContent(text);
        } else {
          const blob = await res.blob();
          setBlobUrl(URL.createObjectURL(blob));
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load file");
        }
      })
      .finally(() => setLoading(false));

    return () => {
      controller.abort();
    };
  }, [open, file?.id]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  if (!open || !file) return null;

  const Icon = kindIcon(kind);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = `/api/v1/files/${file.id}/download`;
    link.download = file.filename;
    link.click();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" ref={containerRef}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* toolbar */}
      <div className="relative z-10 flex items-center justify-between gap-3 bg-slate-900/90 px-4 py-2.5 text-white backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="h-5 w-5 shrink-0 text-slate-300" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{file.filename}</p>
            <p className="text-xs text-slate-400">
              {file.mime_type} &middot; {formatSize(file.size_bytes)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {kind === "image" && (
            <>
              <ToolbarBtn
                icon={ZoomOut}
                label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
              />
              <span className="text-xs text-slate-400 tabular-nums w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <ToolbarBtn
                icon={ZoomIn}
                label="Zoom in"
                onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
              />
              <ToolbarBtn
                icon={RotateCw}
                label="Rotate"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              />
              <Divider />
            </>
          )}
          <ToolbarBtn
            icon={isFullscreen ? Minimize2 : Maximize2}
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          />
          <ToolbarBtn icon={Download} label="Download" onClick={handleDownload} />
          <Divider />
          <ToolbarBtn icon={X} label="Close" onClick={onClose} />
        </div>
      </div>

      {/* content area */}
      <div className="relative z-10 flex-1 flex items-center justify-center overflow-auto p-4">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
            <p className="text-sm text-slate-300">Loading preview…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 text-center max-w-sm">
            <AlertCircle className="h-10 w-10 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
            <button
              onClick={handleDownload}
              className="mt-2 flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download instead
            </button>
          </div>
        )}

        {!loading && !error && kind === "image" && blobUrl && (
          <img
            src={blobUrl}
            alt={file.filename}
            className="max-w-full max-h-full object-contain transition-transform duration-200 select-none"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
            draggable={false}
          />
        )}

        {!loading && !error && kind === "pdf" && blobUrl && (
          <iframe
            src={blobUrl}
            title={file.filename}
            className="w-full h-full rounded-lg bg-white"
          />
        )}

        {!loading && !error && kind === "video" && blobUrl && (
          <video
            src={blobUrl}
            controls
            className="max-w-full max-h-full rounded-lg"
          >
            Your browser does not support video playback.
          </video>
        )}

        {!loading && !error && kind === "audio" && blobUrl && (
          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <FileAudio className="h-12 w-12 text-white" />
            </div>
            <p className="text-white text-sm font-medium text-center">{file.filename}</p>
            <audio src={blobUrl} controls className="w-full" />
          </div>
        )}

        {!loading && !error && kind === "text" && textContent !== null && (
          <div className="w-full max-w-3xl max-h-full overflow-auto">
            <pre className="rounded-lg bg-slate-900 border border-slate-700 p-4 text-sm text-slate-200 font-mono leading-relaxed whitespace-pre-wrap break-words overflow-auto max-h-[80vh]">
              {textContent}
            </pre>
          </div>
        )}

        {!loading && !error && kind === "unsupported" && (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              <File className="h-10 w-10 text-slate-400" />
            </div>
            <div>
              <p className="text-white font-medium">{file.filename}</p>
              <p className="text-sm text-slate-400 mt-1">
                {file.mime_type} &middot; {formatSize(file.size_bytes)}
              </p>
            </div>
            <p className="text-sm text-slate-400">
              Preview is not available for this file type.
            </p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-500 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof X;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-[2.25rem] min-h-[2.25rem] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-600 mx-1" />;
}
