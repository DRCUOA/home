import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { apiGet } from "@/lib/api";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, capitalize } from "@/lib/format";

type SearchParams = { q?: string };

export const Route = createFileRoute("/search")({
  component: SearchPage,
  validateSearch: (raw: Record<string, unknown>): SearchParams => ({
    q: typeof raw.q === "string" ? raw.q : undefined,
  }),
});

function SearchPage() {
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "");
  const [submitted, setSubmitted] = useState(q ?? "");

  useEffect(() => {
    if (q !== undefined && q !== submitted) {
      setQuery(q);
      setSubmitted(q);
    }
    // Only run when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => apiGet<{ data: any[] }>(`/search?q=${encodeURIComponent(submitted)}`),
    enabled: submitted.length >= 2,
  });

  const results = data?.data ?? [];

  return (
    <PageShell title="Search" subtitle="Notes, communications, properties, contacts, research.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query);
        }}
        className="max-w-2xl"
      >
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything..."
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white px-9 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
      </form>

      <div className="mt-6">
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        )}

        {!isLoading && submitted && results.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No results for "{submitted}"
          </p>
        )}

        {results.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.map((r: any) => (
              <Card key={`${r._type}-${r.id}`}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge>{capitalize(r._type)}</Badge>
                      </div>
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {r.title || r.name || r.address || r.subject || "Untitled"}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {r.body || r.notes || r.listing_description || r.description || ""}
                      </p>
                    </div>
                    {r.created_at && (
                      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                        {formatDate(r.created_at)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!submitted && (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Type at least two characters and press Enter to search across your workspace.
          </p>
        )}
      </div>
    </PageShell>
  );
}
