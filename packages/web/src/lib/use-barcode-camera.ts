import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared camera + barcode-detection loop, used by both the modal
 * scanner and the full-screen scan view. Manages getUserMedia
 * lifecycle, detection loop, and same-code debouncing so a code held
 * in front of the camera doesn't fire 60 times a second.
 *
 * The hook owns all camera teardown — callers don't need to coordinate
 * stream stop with `enabled` changes; flipping `enabled` to false or
 * unmounting cleans up.
 *
 * Detection path: prefers the native `BarcodeDetector` (Chrome/Edge on
 * Android + desktop). On iOS Safari — and therefore every browser on
 * iPad/iPhone, since they're all forced onto WebKit — `BarcodeDetector`
 * is missing, so we lazy-load `@zxing/browser` as a fallback. The
 * fallback chunk is only fetched on devices that need it.
 *
 * BarcodeDetector is not yet in the TS DOM lib; typed loosely.
 */

export type DetectorResult = { rawValue: string; format?: string };

interface GlobalBarcodeDetector {
  new (opts?: { formats?: string[] }): {
    detect(source: CanvasImageSource): Promise<DetectorResult[]>;
  };
  getSupportedFormats?: () => Promise<string[]>;
}

function getDetector(): GlobalBarcodeDetector | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: GlobalBarcodeDetector })
    .BarcodeDetector ?? null;
}

/** Default symbology set we ask the detector to look for. */
export const DEFAULT_BARCODE_FORMATS = [
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "qr_code",
];

interface UseBarcodeCameraOpts {
  /** Master switch — when false the camera is stopped and detection paused. */
  enabled: boolean;
  /** Fired once per debounced detection. */
  onScan: (code: string, format?: string) => void;
  /** Suppress repeat detections of the same code within this window. */
  debounceMs?: number;
  /** Symbology list passed to BarcodeDetector. */
  formats?: string[];
}

export type BarcodeCameraState =
  | "idle"
  | "starting"
  | "running"
  | "unsupported"
  | "error";

/** Minimal shape of @zxing/browser's IScannerControls — typed inline
 *  so we don't need to pull in the type at module load. */
interface ZxingControls {
  stop: () => void;
}

interface UseBarcodeCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: BarcodeCameraState;
  error: string | null;
  /** The last detected code, briefly held so callers can flash a toast. */
  flash: string | null;
  /** Re-attempt camera startup after permission/error. */
  retry: () => void;
}

export function useBarcodeCamera({
  enabled,
  onScan,
  debounceMs = 1500,
  formats = DEFAULT_BARCODE_FORMATS,
}: UseBarcodeCameraOpts): UseBarcodeCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<ZxingControls | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastCodeAtRef = useRef<number>(0);
  // Hold the latest onScan in a ref so the camera loop never has a
  // stale closure if the caller rebuilds the callback.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [state, setState] = useState<BarcodeCameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        // ignore — best-effort teardown
      }
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleDetected = useCallback(
    (code: string, format?: string) => {
      const now = Date.now();
      if (
        lastCodeRef.current === code &&
        now - lastCodeAtRef.current < debounceMs
      ) {
        return;
      }
      lastCodeRef.current = code;
      lastCodeAtRef.current = now;

      setFlash(code);
      setTimeout(() => {
        setFlash((current) => (current === code ? null : current));
      }, 700);

      onScanRef.current(code, format);
    },
    [debounceMs]
  );

  const startCamera = useCallback(async () => {
    setError(null);
    setState("starting");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const Detector = getDetector();

      if (Detector) {
        // Native fast path (Chrome/Edge on Android + desktop).
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        const detector = new Detector({ formats });
        setState("running");

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
        return;
      }

      // Fallback path for WebKit (iPad/iPhone — every browser there
      // is WebKit, and WebKit ships no BarcodeDetector). Lazy-import
      // so non-iOS users don't pay the ~120 KB chunk cost.
      if (!videoRef.current) {
        // Component unmounted between starting and stream arrival.
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      // BrowserMultiFormatReader's onDecodeResult passes (result, error).
      // `result` is undefined on frames where nothing was decoded —
      // those errors are noise, not real failures.
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromStream(
        stream,
        videoRef.current,
        (result) => {
          if (result) {
            handleDetected(result.getText());
          }
        }
      );
      zxingControlsRef.current = controls;
      setState("running");
    } catch {
      // Tear down any partially-acquired stream so the camera light
      // doesn't stay on after a failed start.
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      setError(
        "Camera unavailable. Grant camera permission and retry, or enter the code manually."
      );
      setState("error");
    }
  }, [formats, handleDetected]);

  const retry = useCallback(() => {
    stopCamera();
    startCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (enabled) {
      startCamera();
    } else {
      stopCamera();
      setState("idle");
    }
    return stopCamera;
  }, [enabled, startCamera, stopCamera]);

  return { videoRef, state, error, flash, retry };
}

/** Short audio beep used to confirm a scan. Created lazily on first
 *  call because some browsers block AudioContext until a user gesture
 *  has happened. Falls back silently if WebAudio isn't available. */
let audioCtx: AudioContext | null = null;
export function playScanBeep(): void {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  } catch {
    // ignore — audio is best-effort feedback
  }
}

/** Brief vibration on phones that support it. Best-effort. */
export function vibrateScan(): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(40);
    }
  } catch {
    // ignore
  }
}
