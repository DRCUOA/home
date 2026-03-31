import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, X, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface CameraCaptureProps {
  open: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
  title?: string;
}

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
      startCamera();
    } else {
      stopCamera();
      setCaptured(null);
      setError(null);
    }
    return stopCamera;
  }, [open, startCamera, stopCamera]);

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

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {error ? (
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
            <div className="flex items-center justify-center gap-4">
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
                aria-label="Choose from gallery"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
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
