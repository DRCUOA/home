import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScanLine,
  Keyboard,
  RotateCcw,
  Camera as CameraIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

/**
 * Web barcode scanner using the browser-native BarcodeDetector API
 * (https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API).
 *
 * Supported formats: code_128, code_39, ean_13, qr_code, upc_a, upc_e.
 * If the API is unavailable (older Safari etc.) the component falls
 * back to a manual text-entry input so the feature is still usable.
 *
 * Typed loosely because BarcodeDetector is not yet in the standard
 * TypeScript DOM lib.
 */
type DetectorResult = { rawValue: string; format?: string };

interface GlobalBarcodeDetector {
  new (opts?: { formats?: string[] }): {
    detect(source: CanvasImageSource): Promise<DetectorResult[]>;
  };
  getSupportedFormats?: () => Promise<string[]>;
}

interface BarcodeScannerProps {
  open: boolean;
  onScan: (code: string, format?: string) => void;
  onClose: () => void;
  title?: string;
  /** If true, keep the scanner open after a scan so the user can scan more. */
  continuous?: boolean;
}

function getDetector(): GlobalBarcodeDetector | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: GlobalBarcodeDetector })
    .BarcodeDetector ?? null;
}

export function BarcodeScanner({
  open,
  onScan,
  onClose,
  title = "Scan barcode",
  continuous = false,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastCodeAtRef = useRef<number>(0);

  const [manual, setManual] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleDetected = useCallback(
    (code: string, format?: string) => {
      // Debounce: ignore the same code fired twice in quick succession.
      const now = Date.now();
      if (
        lastCodeRef.current === code &&
        now - lastCodeAtRef.current < 1500
      ) {
        return;
      }
      lastCodeRef.current = code;
      lastCodeAtRef.current = now;

      setFlash(code);
      setTimeout(() => setFlash(null), 700);

      onScan(code, format);

      if (!continuous) {
        stopCamera();
      }
    },
    [continuous, onScan, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const Detector = getDetector();
      if (!Detector) {
        setSupported(false);
        setStarting(false);
        return;
      }
      setSupported(true);

      const detector = new Detector({
        formats: [
          "code_128",
          "code_39",
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "qr_code",
        ],
      });

      const loop = async () => {
        if (!videoRef.current || !streamRef.current) return;
        if (videoRef.current.readyState >= 2) {
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length > 0) {
              handleDetected(results[0].rawValue, results[0].format);
            }
          } catch {
            // transient detect errors are fine — next frame retries
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setError(
        "Camera unavailable. Enter the barcode manually, or grant camera permission and retry."
      );
      setSupported(false);
    } finally {
      setStarting(false);
    }
  }, [handleDetected]);

  useEffect(() => {
    if (open && !manualMode) {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [open, manualMode, startCamera, stopCamera]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    handleDetected(code, "manual");
    setManual("");
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {manualMode ? (
          <form onSubmit={submitManual} className="space-y-3">
            <Input
              label="Barcode"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Type or paste a barcode"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 min-h-12"
                onClick={() => setManualMode(false)}
              >
                <CameraIcon className="h-4 w-4" />
                Use camera
              </Button>
              <Button
                type="submit"
                className="flex-1 min-h-12"
                disabled={!manual.trim()}
              >
                <ScanLine className="h-4 w-4" />
                Submit
              </Button>
            </div>
          </form>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CameraIcon className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {error}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={startCamera}>
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
              <Button onClick={() => setManualMode(true)}>
                <Keyboard className="h-4 w-4" />
                Enter manually
              </Button>
            </div>
          </div>
        ) : supported === false ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ScanLine className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              This browser can't auto-detect barcodes. Enter the code
              manually, or open the app in Chrome/Edge/Safari on a phone.
            </p>
            <Button onClick={() => setManualMode(true)}>
              <Keyboard className="h-4 w-4" />
              Enter manually
            </Button>
          </div>
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
              {/* scan reticle */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-3/4 h-1/3 border-2 border-primary-400/90 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
              </div>
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
              {flash && (
                <div className="absolute inset-x-0 bottom-0 bg-emerald-500/95 text-white text-center text-sm font-medium py-2 tracking-wide">
                  Scanned: {flash}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 min-h-12"
                onClick={() => setManualMode(true)}
              >
                <Keyboard className="h-4 w-4" />
                Manual
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1 min-h-12"
                onClick={onClose}
              >
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
