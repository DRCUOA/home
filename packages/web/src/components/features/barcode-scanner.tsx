import { useEffect, useState } from "react";
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
import { useBarcodeCamera } from "@/lib/use-barcode-camera";

/**
 * Modal barcode scanner — the in-page lookup affordance used by the
 * Boxes and Inventory tabs. For walking-around scanning, use the
 * dedicated `/scan` full-screen route instead.
 *
 * Camera + detection live in `useBarcodeCamera`. This component just
 * adds modal chrome, the manual-entry fallback, and the close-on-scan
 * vs. continuous behaviour.
 */
interface BarcodeScannerProps {
  open: boolean;
  onScan: (code: string, format?: string) => void;
  onClose: () => void;
  title?: string;
  /** If true, keep the scanner open after a scan so the user can scan more. */
  continuous?: boolean;
}

export function BarcodeScanner({
  open,
  onScan,
  onClose,
  title = "Scan barcode",
  continuous = false,
}: BarcodeScannerProps) {
  const [manual, setManual] = useState("");
  const [manualMode, setManualMode] = useState(false);

  const handleScan = (code: string, format?: string) => {
    onScan(code, format);
    if (!continuous) onClose();
  };

  const cameraEnabled = open && !manualMode;
  const { videoRef, state, error, flash, retry } = useBarcodeCamera({
    enabled: cameraEnabled,
    onScan: handleScan,
  });

  // Reset manual-mode when the modal is closed so the next open starts
  // back on the camera.
  useEffect(() => {
    if (!open) {
      setManual("");
      setManualMode(false);
    }
  }, [open]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    handleScan(code, "manual");
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
        ) : state === "error" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CameraIcon className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {error}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
              <Button onClick={() => setManualMode(true)}>
                <Keyboard className="h-4 w-4" />
                Enter manually
              </Button>
            </div>
          </div>
        ) : state === "unsupported" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ScanLine className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              This browser can't auto-detect barcodes. Enter the code
              manually below.
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
              {state === "starting" && (
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
