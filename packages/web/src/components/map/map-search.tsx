import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, MapPin } from "lucide-react";
import { apiGet } from "@/lib/api";

interface AutocompleteResult {
  address: string;
  pxid: string;
}

interface AddressMetadata {
  latitude: number;
  longitude: number;
  address: string;
  suburb?: string;
  city?: string;
}

interface MapSearchProps {
  onFlyTo: (lng: number, lat: number, zoom?: number) => void;
  compact?: boolean;
  chrome?: "standalone" | "embedded";
}

export function MapSearch({
  onFlyTo,
  compact = false,
  chrome = "standalone",
}: MapSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const res = await apiGet<{ data: AutocompleteResult[] }>(
        `/map/address-autocomplete?q=${encodeURIComponent(q)}`
      );
      setResults(res.data);
      setIsOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectResult = async (result: AutocompleteResult) => {
    setQuery(result.address);
    setIsOpen(false);

    try {
      const res = await apiGet<{ data: AddressMetadata }>(
        `/map/address-metadata?pxid=${encodeURIComponent(result.pxid)}`
      );
      onFlyTo(res.data.longitude, res.data.latitude, 16);
    } catch {
      // fall through
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={
          chrome === "standalone"
            ? "flex items-center gap-2 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-slate-200 dark:border-slate-700 px-3 py-2"
            : "flex items-center gap-1.5 px-1 py-0.5"
        }
      >
        <Search className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search NZ addresses..."
          className={`flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none ${
            compact ? "text-xs min-h-[1.5rem]" : "text-sm min-h-[2rem]"
          }`}
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 max-h-72 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.pxid}
              onClick={() => selectResult(r)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[2.75rem]"
            >
              <MapPin className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
              <span className="truncate">{r.address}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && loading && results.length === 0 && query.length >= 3 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700 px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Searching...
        </div>
      )}
    </div>
  );
}
