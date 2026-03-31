import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  RotateCcw,
  Check,
  X,
  ImagePlus,
  Images,
  ArrowLeft,
  Loader2,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { apiGet } from "@/lib/api";
import { ImageScanEditor } from "@/components/features/image-scan-editor";
import type { FileRecord } from "@hcc/shared";

type ListResponse<T> = { data: T[]; total: number };

interface CameraCaptureProps {
  open: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
  title?: string;
}

type CameraMode = "camera" | "gallery";

export function CameraCapture({
  open,
  onCapture,
  onClose,
  title = "Take photo",
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [error, setError] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const [mode, setMode] = useState<CameraMode>("camera");
  const [galleryPhotos, setGalleryPhotos] = useState<FileRecord[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryPicking, setGalleryPicking] = useState<string | null>(null);

  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [editorSource, setEditorSource] = useState<"camera" | "gallery" | null>(
    null
  );

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCaptured(null);
      setError(null);
      stopCamera();

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setHasMultipleCameras(videoDevices.length > 1);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError(
        "Camera access denied or unavailable. You can choose a photo from your gallery instead."
      );
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (open) {
      setMode("camera");
      startCamera();
    } else {
      stopCamera();
      setCaptured(null);
      setError(null);
      setGalleryPhotos([]);
      setGalleryPicking(null);
      setEditorImage((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setEditorSource(null);
    }
    return stopCamera;
  }, [open, startCamera, stopCamera]);

  const loadGallery = async () => {
    setGalleryLoading(true);
    try {
      const result = await apiGet<ListResponse<FileRecord>>("/files");
      setGalleryPhotos(
        (result.data ?? [])
          .filter((f) => f.mime_type.startsWith("image/"))
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          )
      );
    } catch {
      setGalleryPhotos([]);
    } finally {
      setGalleryLoading(false);
    }
  };

  const openGallery = () => {
    stopCamera();
    setMode("gallery");
    loadGallery();
  };

  const backToCamera = () => {
    setMode("camera");
    startCamera();
  };

  const pickGalleryImage = async (photo: FileRecord) => {
    setGalleryPicking(photo.id);
    try {
      const resp = await fetch(`/api/v1/files/${photo.id}/download`, {
        credentials: "include",
      });
      const blob = await resp.blob();
      setEditorImage(URL.createObjectURL(blob));
      setEditorSource("gallery");
    } catch {
      // fall through
    } finally {
      setGalleryPicking(null);
    }
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCaptured(dataUrl);
    stopCamera();
  };

  const dataUrlToFile = (dataUrl: string): File => {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new File([u8arr], `capture-${Date.now()}.jpg`, { type: mime });
  };

  const handleConfirm = () => {
    if (!captured) return;
    onCapture(dataUrlToFile(captured));
  };

  const handleRetake = () => {
    setCaptured(null);
    startCamera();
  };

  const toggleFacing = () => {
    setFacingMode((prev) =>
      prev === "environment" ? "user" : "environment"
    );
  };

  const handleGalleryPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onCapture(file);
  };

  const openEditorFromCapture = () => {
    if (captured) {
      setEditorImage(captured);
      setEditorSource("camera");
    }
  };

  const handleEditorConfirm = (file: File) => {
    if (editorImage?.startsWith("blob:")) URL.revokeObjectURL(editorImage);
    setEditorImage(null);
    setEditorSource(null);
    setCaptured(null);
    onCapture(file);
  };

  const handleEditorBack = () => {
    if (editorImage?.startsWith("blob:")) URL.revokeObjectURL(editorImage);
    setEditorImage(null);
    const source = editorSource;
    setEditorSource(null);
    if (source === "gallery") {
      // stay on gallery grid — mode is already "gallery"
    } else {
      // camera source: captured is still set, so preview re-appears
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {editorImage ? (
          <ImageScanEditor
            imageSrc={editorImage}
            onConfirm={handleEditorConfirm}
            onBack={handleEditorBack}
          />
        ) : mode === "gallery" ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={backToCamera}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                aria-label="Back to camera"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Gallery
              </span>
            </div>

            {galleryLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
              </div>
            ) : galleryPhotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Images className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No photos in your Gallery yet
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 max-h-[60vh] overflow-y-auto rounded-lg">
                {galleryPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => pickGalleryImage(photo)}
                    disabled={galleryPicking !== null}
                    className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 hover:ring-2 hover:ring-primary-500 focus:ring-2 focus:ring-primary-500 transition-all"
                  >
                    <img
                      src={`/api/v1/files/${photo.id}/download`}
                      alt={photo.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {galleryPicking === photo.id && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Camera className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {error}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={startCamera}>
                Retry camera
              </Button>
              <Button onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4" />
                Choose photo
              </Button>
              <Button variant="secondary" onClick={openGallery}>
                <Images className="h-4 w-4" />
                Gallery
              </Button>
            </div>
          </div>
        ) : captured ? (
          <>
            <div className="relative rounded-lg overflow-hidden bg-black">
              <img
                src={captured}
                alt="Captured"
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 min-h-12"
                onClick={handleRetake}
              >
                <RotateCcw className="h-4 w-4" />
                Retake
              </Button>
              <Button
                variant="secondary"
                className="min-h-12"
                onClick={openEditorFromCapture}
              >
                <ScanLine className="h-4 w-4" />
                Scan
              </Button>
              <Button className="flex-1 min-h-12" onClick={handleConfirm}>
                <Check className="h-4 w-4" />
                Use photo
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex items-center justify-center gap-3">
              {hasMultipleCameras ? (
                <button
                  type="button"
                  onClick={toggleFacing}
                  className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
                  aria-label="Switch camera"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
              ) : (
                <div className="w-[2.75rem]" />
              )}
              <button
                type="button"
                onClick={handleCapture}
                className="h-16 w-16 rounded-full bg-white dark:bg-slate-200 border-4 border-primary-600 flex items-center justify-center hover:bg-primary-50 active:bg-primary-100 transition-colors"
                aria-label="Capture photo"
              >
                <div className="h-12 w-12 rounded-full bg-primary-600" />
              </button>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={openGallery}
                  className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
                  aria-label="Choose from Gallery"
                  title="Gallery"
                >
                  <Images className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
                  aria-label="Choose from files"
                  title="Files"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
              </div>
            </div>
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleGalleryPick}
        />
      </div>
    </Modal>
  );
}
