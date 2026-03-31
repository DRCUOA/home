import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Camera,
  Upload,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Download,
} from "lucide-react";
import type { FileRecord } from "@hcc/shared";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiUpload, apiDelete } from "@/lib/api";
import { CameraCapture } from "@/components/features/camera-capture";
import { formatDate } from "@/lib/format";

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
});

function isImage(mime: string) {
  return mime.startsWith("image/");
}

function thumbUrl(id: string) {
  return `/api/v1/files/${id}/download`;
}

function GalleryPage() {
  const qc = useQueryClient();

  const filesQuery = useQuery({
    queryKey: ["files"],
    queryFn: () => apiGet<ListResponse<FileRecord>>("/files"),
  });

  const photos = useMemo(() => {
    const all = filesQuery.data?.data ?? [];
    return all
      .filter((f) => isImage(f.mime_type))
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [filesQuery.data]);

  const uploadFile = useMutation({
    mutationFn: (formData: FormData) =>
      apiUpload<{ data: FileRecord }>("/files/upload", formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });

  const deleteFile = useMutation({
    mutationFn: (id: string) => apiDelete(`/files/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });

  const [cameraOpen, setCameraOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleCameraCapture = (file: File) => {
    setCameraOpen(false);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "photo");
    uploadFile.mutate(fd);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    for (let i = 0; i < selected.length; i++) {
      const fd = new FormData();
      fd.append("file", selected[i]);
      fd.append("category", "photo");
      uploadFile.mutate(fd);
    }
    e.target.value = "";
  };

  const handleDelete = (id: string) => {
    deleteFile.mutate(id);
    setLightboxIndex(null);
  };

  if (filesQuery.isLoading) {
    return (
      <PageShell title="Gallery">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
          <p className="text-sm">Loading photos…</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Gallery">
      <div className="space-y-4 pb-4">
        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {photos.length} {photos.length === 1 ? "photo" : "photos"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              className="min-h-11"
              onClick={() => setCameraOpen(true)}
            >
              <Camera className="h-4 w-4" />
              Camera
            </Button>
            <label className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 active:bg-primary-800 cursor-pointer transition-colors min-h-11">
              <Upload className="h-4 w-4" />
              Upload
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilePick}
              />
            </label>
          </div>
        </div>

        {uploadFile.isPending && (
          <div className="flex items-center gap-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 px-3 py-2 text-sm text-primary-700 dark:text-primary-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </div>
        )}

        {/* Gallery grid */}
        {photos.length === 0 ? (
          <EmptyState
            icon={<ImageOff className="h-10 w-10" />}
            title="No photos yet"
            description="Take a photo or upload images to build your gallery."
            action={
              <Button className="min-h-11" onClick={() => setCameraOpen(true)}>
                <Camera className="h-4 w-4" />
                Take photo
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 group focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                onClick={() => setLightboxIndex(i)}
              >
                <img
                  src={thumbUrl(photo.id)}
                  alt={photo.filename}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </div>

      <CameraCapture
        open={cameraOpen}
        onCapture={handleCameraCapture}
        onClose={() => setCameraOpen(false)}
        title="Take photo"
      />

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={handleDelete}
        />
      )}
    </PageShell>
  );
}

/* ---------- Lightbox ---------- */

function Lightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  onDelete,
}: {
  photos: FileRecord[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1);
  }, [hasPrev, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1);
  }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goPrev, goNext]);

  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 60) {
      if (diff > 0) goPrev();
      else goNext();
    }
    setTouchStart(null);
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = thumbUrl(photo.id);
    link.download = photo.filename;
    link.click();
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 truncate">{photo.filename}</p>
          <p className="text-xs text-white/50">
            {formatDate(photo.created_at)} · {index + 1} of {photos.length}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            type="button"
            onClick={handleDownload}
            className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
            aria-label="Download"
          >
            <Download className="h-5 w-5" />
          </button>
          {confirmDelete ? (
            <button
              type="button"
              onClick={() => onDelete(photo.id)}
              className="px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors min-h-[2.75rem]"
            >
              Confirm delete
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-2.5 rounded-full text-white/70 hover:text-red-400 hover:bg-white/10 transition-colors min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
              aria-label="Delete"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center relative px-2 min-h-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors z-10 min-w-[2.75rem] min-h-[2.75rem] items-center justify-center hidden sm:flex"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <img
          key={photo.id}
          src={thumbUrl(photo.id)}
          alt={photo.filename}
          className="max-w-full max-h-full object-contain rounded-lg select-none"
          draggable={false}
        />

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors z-10 min-w-[2.75rem] min-h-[2.75rem] items-center justify-center hidden sm:flex"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {photos.length > 1 && (
        <div className="shrink-0 px-4 py-3 overflow-x-auto">
          <div className="flex gap-1.5 justify-center">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`shrink-0 w-12 h-12 rounded-md overflow-hidden transition-all ${
                  i === index
                    ? "ring-2 ring-primary-400 opacity-100 scale-105"
                    : "opacity-50 hover:opacity-80"
                }`}
                onClick={() => {
                  onIndexChange(i);
                  setConfirmDelete(false);
                }}
              >
                <img
                  src={thumbUrl(p.id)}
                  alt={p.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
