interface Point {
  x: number;
  y: number;
}

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
};

const MAX_DETECT_DIM = 1024;
const MAX_TRANSFORM_DIM = 4096;

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker("/scan-worker.js");

    worker.onmessage = (e) => {
      const { type, id, ...data } = e.data;
      const req = pending.get(id);
      if (!req) return;
      pending.delete(id);

      if (type === "error") {
        req.reject(new Error(data.error));
      } else {
        req.resolve(data);
      }
    };

    worker.onerror = () => {
      for (const [, req] of pending) {
        req.reject(new Error("Scan worker crashed"));
      }
      pending.clear();
    };
  }
  return worker;
}

function sendMessage(
  msg: Record<string, unknown>,
  transfers: Transferable[] = []
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...msg, id }, transfers);
  });
}

function imgToCanvas(
  img: HTMLImageElement,
  maxDim?: number
): { canvas: HTMLCanvasElement; scale: number } {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  let scale = 1;

  if (maxDim) {
    const maxSide = Math.max(w, h);
    if (maxSide > maxDim) {
      scale = maxDim / maxSide;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(img, 0, 0, w, h);

  return { canvas, scale };
}

/**
 * Start loading OpenCV in the worker in the background.
 * Call early (e.g. when the scan editor mounts) so the
 * first scan is faster.
 */
export function preloadScanWorker(): void {
  sendMessage({ type: "preload" }).catch(() => {
    /* ignore preload errors — real errors surface on use */
  });
}

/**
 * Detect a rectangular document in the image.
 * Returns four ordered corners (TL, TR, BR, BL) in
 * original image coordinates, or null if none found.
 *
 * The image is downscaled to ≤1024px for fast detection;
 * corners are scaled back to original resolution.
 */
export async function detectDocumentEdges(
  img: HTMLImageElement
): Promise<Point[] | null> {
  const { canvas, scale } = imgToCanvas(img, MAX_DETECT_DIM);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buffer = imageData.data.buffer;

  const result = await sendMessage(
    { type: "detect", buffer, width: canvas.width, height: canvas.height },
    [buffer]
  );

  if (!result.corners) return null;

  return (result.corners as Point[]).map((c) => ({
    x: c.x / scale,
    y: c.y / scale,
  }));
}

/**
 * Apply a perspective transform to flatten the region
 * defined by `corners` into a rectangle.
 * Returns a JPEG data-URL of the result.
 *
 * Input is capped at 4096px to keep memory reasonable.
 */
export async function applyPerspectiveTransform(
  img: HTMLImageElement,
  corners: Point[]
): Promise<string> {
  const { canvas, scale } = imgToCanvas(img, MAX_TRANSFORM_DIM);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buffer = imageData.data.buffer;

  const scaledCorners = corners.map((c) => ({
    x: c.x * scale,
    y: c.y * scale,
  }));

  const result = await sendMessage(
    {
      type: "transform",
      buffer,
      width: canvas.width,
      height: canvas.height,
      corners: scaledCorners,
    },
    [buffer]
  );

  const out = document.createElement("canvas");
  out.width = result.width;
  out.height = result.height;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Could not create output canvas");

  const outData = new ImageData(
    new Uint8ClampedArray(result.buffer),
    result.width,
    result.height
  );
  outCtx.putImageData(outData, 0, 0);

  return out.toDataURL("image/jpeg", 0.92);
}

export function destroyScanWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    pending.clear();
  }
}
