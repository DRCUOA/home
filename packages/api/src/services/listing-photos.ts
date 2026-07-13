import { createHash } from "crypto";

/**
 * Scrapes photo URLs from a property listing page.
 *
 * NZ listing sites (Trade Me, homes.co.nz, realestate.co.nz, OneRoof) are
 * SPAs: the static HTML usually holds only the og:image hero and a couple of
 * gallery <img> tags, while the full gallery lives in embedded JSON payloads
 * (__NEXT_DATA__ / Nuxt / Apollo state) with `\/`-escaped URLs, or in
 * lazy-load attributes (data-src, srcset). So beyond the obvious meta tags we
 * sweep all of those, collapse size variants of the same photo down to the
 * largest, and upgrade known CDN URLs to their full-resolution form.
 */

export const MAX_LISTING_PHOTOS = 30;

/** Stable per-source-URL id, used in filenames so re-enriching a property
 * skips photos that were already downloaded instead of duplicating them. */
export function photoUrlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 10);
}

const JUNK_RE =
  /logo|icon|avatar|favicon|placeholder|sprite|badge|banner|staticmap|streetview|1x1|\.svg|\.gif/i;
// Context that marks a URL/tag as likely belonging to the listing's photo set
// (vs. site furniture) when it's found outside an unambiguous slot like og:image.
const LISTING_CONTEXT_RE =
  /gallery|carousel|slider|slide|property|listing|hero|photo|main-image|image|img|media/i;
// Image CDNs of the major NZ listing portals — trusted even without context keywords.
const LISTING_CDN_RE =
  /tmcdn\.co\.nz|trademe\.co\.nz|homes\.co\.nz|oneroof\.co\.nz|realestate\.co\.nz/i;
const IMAGE_URL_RE =
  /https?:\/\/[^"'\s\\<>)]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\s\\<>)]*)?/gi;

/** Undo the escaping used inside embedded JSON payloads and HTML attributes
 * so IMAGE_URL_RE can see the real URLs. */
function decodeEmbedded(html: string): string {
  return html
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#x2[fF];/g, "/");
}

/** Rewrite known CDN URLs to their full-resolution variant.
 * Trade Me serves photoserver/<size>/<id>.jpg with sizes tq/thumb/plus/full. */
function upgradeCdnUrl(url: string): string {
  return url.replace(/(\/photoserver\/)[a-z]+(\/)/i, "$1full$2");
}

/** Pick the largest candidate out of a srcset attribute. */
function bestFromSrcset(srcset: string): string | null {
  let best: string | null = null;
  let bestSize = -1;
  for (const part of srcset.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const size = descriptor?.endsWith("w")
      ? parseInt(descriptor, 10)
      : descriptor?.endsWith("x")
        ? parseFloat(descriptor) * 1000
        : 0;
    if (size >= bestSize) {
      bestSize = size;
      best = url;
    }
  }
  return best;
}

/** Key that is identical for different size variants of the same photo, so
 * they can be collapsed to one download. */
function variantKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname
      .replace(
        /\/(?:tq|thumb(?:nail)?s?|tiny|small|medium|med|large|xl|xxl|full|orig(?:inal)?|hero|plus|std)(?=\/)/gi,
        "/~"
      )
      .replace(/[-_]\d{2,4}x\d{2,4}(?=\.\w+$)/, "")
      .replace(/[-_][wh]\d{2,4}(?=\.\w+$)/, "")
      .replace(
        /[-_](?:tq|thumb(?:nail)?s?|tiny|small|medium|med|large|xl|xxl|full|orig(?:inal)?|hero|plus|std)(?=\.\w+$)/i,
        ""
      );
    return u.hostname + path;
  } catch {
    return url;
  }
}

/** Rough pixel-area estimate used to pick the best variant of a photo. */
function sizeScore(url: string): number {
  const dims = url.match(/(\d{2,4})x(\d{2,4})/);
  if (dims) return Number(dims[1]) * Number(dims[2]);
  const width = url.match(/[?&](?:w|width)=(\d{2,4})/i);
  if (width) return Number(width[1]) * Number(width[1]) * 0.75;
  if (/full|orig(?:inal)?|xxl|hero/i.test(url)) return 4_000_000;
  if (/plus|large|xl/i.test(url)) return 2_000_000;
  if (/med(?:ium)?|std/i.test(url)) return 500_000;
  if (/thumb|tiny|tq|small/i.test(url)) return 10_000;
  return 1_000_000; // unknown — assume usable
}

type Candidate = {
  url: string;
  /** Lower = more clearly the listing's own photo (og:image beats a URL
   * pulled out of a script blob, which may belong to a "similar listings"
   * widget). Used to order the final list so the cap trims the right end. */
  priority: number;
  order: number;
};

export async function scrapeListingPhotoUrls(
  listingUrl: string
): Promise<string[]> {
  try {
    const res = await fetch(listingUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) {
      console.log(
        `[Enrich] Listing fetch failed: ${res.status} ${res.statusText}`
      );
      return [];
    }

    const html = await res.text();
    const candidates: Candidate[] = [];
    let order = 0;

    const add = (rawUrl: string | null | undefined, priority: number) => {
      if (!rawUrl) return;
      let url = rawUrl.trim();
      if (url.startsWith("//")) url = "https:" + url;
      if (!url.startsWith("http")) return;
      if (JUNK_RE.test(url)) return;
      candidates.push({ url: upgradeCdnUrl(url), priority, order: order++ });
    };

    // ── og:image (either attribute order) ──
    for (const m of html.matchAll(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi
    ))
      add(m[1], 0);
    for (const m of html.matchAll(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi
    ))
      add(m[1], 0);

    // ── JSON-LD photo/image arrays ──
    for (const block of html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )) {
      try {
        const data = JSON.parse(block[1]);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          for (const field of [item.photo, item.image]) {
            if (Array.isArray(field)) {
              for (const entry of field)
                add(
                  typeof entry === "string"
                    ? entry
                    : (entry?.contentUrl ?? entry?.url),
                  1
                );
            } else if (typeof field === "string") {
              add(field, 1);
            }
          }
        }
      } catch {
        /* skip malformed JSON-LD */
      }
    }

    // ── <img>/<source> tags, including lazy-load attributes and srcsets ──
    for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
      const tag = m[0];
      const attr = (name: string) =>
        tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];

      const urls = [
        attr("src"),
        attr("data-src"),
        attr("data-lazy-src"),
        attr("data-original"),
        bestFromSrcset(attr("srcset") ?? ""),
        bestFromSrcset(attr("data-srcset") ?? ""),
      ];
      for (const url of urls) {
        if (!url) continue;
        if (LISTING_CONTEXT_RE.test(tag) || LISTING_CDN_RE.test(url))
          add(url, 2);
      }
    }

    // ── Global sweep of the decoded document: catches gallery URLs inside
    //    embedded JSON payloads (__NEXT_DATA__ etc.), inline styles, and any
    //    markup the passes above missed. ──
    for (const m of decodeEmbedded(html).matchAll(IMAGE_URL_RE)) {
      const url = m[0];
      if (LISTING_CONTEXT_RE.test(url) || LISTING_CDN_RE.test(url))
        add(url, 3);
    }

    // ── Collapse size variants of the same photo, keeping the largest ──
    const byVariant = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const key = variantKey(candidate.url);
      const existing = byVariant.get(key);
      if (
        !existing ||
        sizeScore(candidate.url) > sizeScore(existing.url) ||
        (sizeScore(candidate.url) === sizeScore(existing.url) &&
          candidate.priority < existing.priority)
      ) {
        // Keep the strongest provenance seen for this photo even when a
        // later, larger variant wins the URL.
        byVariant.set(key, {
          ...candidate,
          priority: Math.min(candidate.priority, existing?.priority ?? 99),
          order: existing?.order ?? candidate.order,
        });
      }
    }

    const cleaned = [...byVariant.values()]
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
      .map((c) => c.url);

    console.log(
      `[Enrich] Scraped ${cleaned.length} photo URLs from listing page`
    );
    return cleaned;
  } catch (err) {
    console.error(
      "[Enrich] Failed to scrape listing page:",
      (err as Error).message
    );
    return [];
  }
}
