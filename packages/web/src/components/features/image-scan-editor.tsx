import { useCallback, useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  ScanLine,
  ArrowLeft,
  Check,
  Undo2,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  detectDocumentEdges,
  applyPerspectiveTransform,
  preloadScanWorker,
} from "@/lib/scan-service";

interface Point {
  x: number;
  y: number;
}

interface ImageScanEditorProps {
  imageSrc: string;
  onConfirm: (file: File) => void;
  onBack: () => void;
}

type ScanPhase = "idle" | "loading" | "adjusting" | "applying";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

export function ImageScanEditor({
  imageSrc,
  onConfirm,
  onBack,
}: ImageScanEditorProps) {
  const [zoom, setZoom] = useState(1);
  const [currentSrc, setCurrentSrc] = useState(imageSrc);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [corners, setCorners] = useState<Point[] | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState<number | null>(null);
  const [hasBeenScanned, setHasBeenScanned] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    preloadScanWorker();
  }, []);

  const handleImageLoad = () => {
    if (imgRef.current) {
      setImgSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  };

  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));

  // ── Document detection (runs in Web Worker) ───────────────────────

  const detectDocument = useCallback(async () => {
    setScanPhase("loading");
    setStatusMsg("Scanning…");

    try {
      const img = imgRef.current;
      if (!img || !img.complete || !img.naturalWidth)
        throw new Error("Image not loaded");

      const detected = await detectDocumentEdges(img);

      if (detected) {
        setCorners(detected);
        setStatusMsg("Drag corners to adjust, then Apply");
      } else {
        const w = imgSize.w;
        const h = imgSize.h;
        const m = 0.1;
        setCorners([
          { x: w * m, y: h * m },
          { x: w * (1 - m), y: h * m },
          { x: w * (1 - m), y: h * (1 - m) },
          { x: w * m, y: h * (1 - m) },
        ]);
        setStatusMsg("No document detected — drag corners manually");
      }
      setScanPhase("adjusting");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Scan failed");
      setScanPhase("idle");
    }
  }, [imgSize]);

  // ── Perspective transform (runs in Web Worker) ────────────────────

  const applyTransform = useCallback(async () => {
    if (!corners || corners.length !== 4) return;
    setScanPhase("applying");
    setStatusMsg("Flattening…");

    try {
      const img = imgRef.current;
      if (!img) throw new Error("Image not loaded");

      const dataUrl = await applyPerspectiveTransform(img, corners);

      setCurrentSrc(dataUrl);
      setHasBeenScanned(true);
      setCorners(null);
      setZoom(1);
      setScanPhase("idle");
      setStatusMsg(null);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Transform failed");
      setScanPhase("adjusting");
    }
  }, [corners]);

  // ── Actions ───────────────────────────────────────────────────────

  const undoScan = () => {
    setCurrentSrc(imageSrc);
    setHasBeenScanned(false);
    setCorners(null);
    setScanPhase("idle");
    setZoom(1);
    setStatusMsg(null);
  };

  const cancelScan = () => {
    setCorners(null);
    setScanPhase("idle");
    setStatusMsg(null);
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;

    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    c.toBlob(
      (blob) => {
        if (blob) {
          onConfirm(
            new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" })
          );
        }
      },
      "image/jpeg",
      0.92
    );
  };

  // ── Corner dragging ───────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(idx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragging === null || !corners) return;
    const img = imgRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.max(
      0,
      Math.min((e.clientX - rect.left) * scaleX, img.naturalWidth)
    );
    const y = Math.max(
      0,
      Math.min((e.clientY - rect.top) * scaleY, img.naturalHeight)
    );

    setCorners((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[dragging] = { x, y };
      return next;
    });
  };

  const handlePointerUp = () => setDragging(null);

  // ── Render ────────────────────────────────────────────────────────

  const handleR = Math.max(20, Math.max(imgSize.w, imgSize.h) * 0.015);
  const strokeW = Math.max(4, Math.max(imgSize.w, imgSize.h) * 0.003);

  return (
    <div className="space-y-3">
      {/* Image + corner overlay */}
      <div
        className="relative overflow-hidden rounded-lg bg-black flex items-center justify-center"
        style={{ maxHeight: "60vh" }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center",
            transition: dragging !== null ? "none" : "transform 0.2s",
          }}
        >
          <div className="relative inline-flex">
            <img
              ref={imgRef}
              src={currentSrc}
              alt="Preview"
              onLoad={handleImageLoad}
              className="block max-w-full max-h-[60vh]"
              draggable={false}
            />

            {corners && imgSize.w > 0 && (
              <svg
                viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
                className="absolute top-0 left-0 w-full h-full"
                style={{ pointerEvents: "none" }}
              >
                <path
                  d={`M0,0 L${imgSize.w},0 L${imgSize.w},${imgSize.h} L0,${imgSize.h} Z M${corners[0].x},${corners[0].y} L${corners[1].x},${corners[1].y} L${corners[2].x},${corners[2].y} L${corners[3].x},${corners[3].y} Z`}
                  fill="rgba(0,0,0,0.45)"
                  fillRule="evenodd"
                />

                <polygon
                  points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
                  fill="none"
                  stroke="rgb(255,69,0)"
                  strokeWidth={strokeW}
                  strokeLinejoin="round"
                />

                {corners.map((c, i) => {
                  const next = corners[(i + 1) % 4];
                  return (
                    <line
                      key={`edge-${i}`}
                      x1={c.x}
                      y1={c.y}
                      x2={next.x}
                      y2={next.y}
                      stroke="rgb(255,69,0)"
                      strokeWidth={strokeW * 0.5}
                      strokeDasharray={`${strokeW * 3} ${strokeW * 2}`}
                      opacity={0.5}
                    />
                  );
                })}

                {corners.map((c, i) => (
                  <circle
                    key={i}
                    cx={c.x}
                    cy={c.y}
                    r={handleR}
                    fill="rgb(255,69,0)"
                    stroke="white"
                    strokeWidth={strokeW * 0.8}
                    style={{
                      pointerEvents: "auto",
                      cursor: "grab",
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => handlePointerDown(e, i)}
                  />
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-10 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {/* Status message */}
      {statusMsg && (
        <p className="text-xs text-center text-amber-500 dark:text-amber-400">
          {statusMsg}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {scanPhase === "adjusting" ? (
          <>
            <Button
              variant="secondary"
              className="flex-1 min-h-11"
              onClick={cancelScan}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button className="flex-1 min-h-11" onClick={applyTransform}>
              <Check className="h-4 w-4" />
              Apply
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            {hasBeenScanned && (
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={undoScan}
                title="Undo scan"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="secondary"
              className="min-h-11"
              onClick={detectDocument}
              disabled={scanPhase === "loading" || scanPhase === "applying"}
            >
              {scanPhase === "loading" || scanPhase === "applying" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              Scan
            </Button>

            <Button className="flex-1 min-h-11" onClick={handleConfirm}>
              <Check className="h-4 w-4" />
              Use photo
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
