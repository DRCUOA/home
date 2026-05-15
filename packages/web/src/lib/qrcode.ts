import qrcode from "qrcode-generator";

/**
 * Render a QR code for `text` as a scalable SVG string. Output has a
 * viewBox sized to the module count so it scales cleanly to any CSS
 * width — same convention as code128.ts.
 *
 * `scalable: true` makes qrcode-generator emit `viewBox` markup rather
 * than fixed pixel sizing, which is what we want for print layouts.
 *
 * Error-correction level defaults to "M" (~15% recovery) which is the
 * sweet spot for printed labels — survives a moving-day ding without
 * blowing up the module count.
 */
export function qrSvg(
  text: string,
  opts: {
    /** 0 = automatic version (size). Bump if you need to encode a lot
     *  of data; the default fits the URL-style payloads we use. */
    typeNumber?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
    /** Error-correction level. "L" 7%, "M" 15%, "Q" 25%, "H" 30%. */
    errorCorrection?: "L" | "M" | "Q" | "H";
    /** Quiet-zone margin in cells. 4 is the QR spec minimum. */
    margin?: number;
  } = {}
): string {
  const typeNumber = opts.typeNumber ?? 0;
  const ec = opts.errorCorrection ?? "M";
  const margin = opts.margin ?? 4;

  const qr = qrcode(typeNumber, ec);
  qr.addData(text || " ");
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin, scalable: true });
}
