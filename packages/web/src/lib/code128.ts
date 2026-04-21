/**
 * Minimal Code 128B barcode → SVG renderer. Zero-dependency.
 *
 * Handles the printable-ASCII subset (values 0..94 in Code 128B, which
 * maps to chars " " (32) through "~" (126)). Good enough for barcodes
 * made of box IDs: letters, digits, dashes.
 *
 * Output is an <svg> markup string sized 0..W x 0..H in a viewBox so it
 * scales to any CSS width.
 *
 * Algorithm: standard Code 128B encoding — StartB, data, checksum,
 * Stop + terminator bar.
 */

// Each entry is the 11-module pattern for values 0..106. 1 = bar, 0 = space.
// Standard Code 128 patterns.
const PATTERNS = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "1100011101011",
];

const START_B = 104;
const STOP = 106;

/**
 * Encode a UTF-8 string into Code 128B values (printable ASCII only).
 * Non-printable or non-ASCII characters are mapped to "?".
 */
function encodeB(input: string): number[] {
  const vals: number[] = [];
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      vals.push(code - 32);
    } else {
      vals.push("?".charCodeAt(0) - 32);
    }
  }
  return vals;
}

/**
 * Render a Code 128B barcode for `text` as an SVG string. Output has
 * viewBox `0 0 <width> <height>` and scales to any CSS width.
 */
export function code128Svg(
  text: string,
  opts: { height?: number; barWidth?: number; quietZone?: number } = {}
): string {
  const barWidth = opts.barWidth ?? 2;
  const height = opts.height ?? 80;
  const quiet = opts.quietZone ?? 10;

  const data = encodeB(text || " ");

  // Build the symbol sequence: START_B, data..., checksum, STOP.
  const symbols: number[] = [START_B, ...data];

  // Checksum = (START value + sum(value * position)) mod 103
  let sum = START_B;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * (i + 1);
  }
  const checksum = sum % 103;
  symbols.push(checksum);
  symbols.push(STOP);

  // Concatenate all module patterns.
  let pattern = "";
  for (const s of symbols) pattern += PATTERNS[s];

  const totalWidth = pattern.length * barWidth + quiet * 2;

  // Emit <rect> for each run of 1s.
  const rects: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "1") {
      let j = i;
      while (j < pattern.length && pattern[j] === "1") j++;
      const x = quiet + i * barWidth;
      const w = (j - i) * barWidth;
      rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`);
      i = j;
    } else {
      i++;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}
