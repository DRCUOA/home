import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { apiGet } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, capitalize } from "@/lib/format";

export const Route = createFileRoute("/search")({ component: SearchPage });

function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => apiGet(`/search?q=${encodeURIComponent(submitted)}`),
    enabled: submitted.length >= 2,
  });

  const results = data?.data || [];

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 safe-area-top">
        <div className="flex items-center gap-2 h-14 px-4 max-w-lg mx-auto">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(query);
            }}
            className="flex-1 flex items-center gap-2"
          >
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-base focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                autoFocus
              />
            </div>
          </form>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-4">
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && submitted && results.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-12">
            No results for "{submitted}"
          </p>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((r: any) => (
              <Card key={`${r._type}-${r.id}`}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge>{capitalize(r._type)}</Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {r.title || r.name || r.address || r.subject || "Untitled"}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                        {r.body || r.notes || r.listing_description || r.description || ""}
                      </p>
                    </div>
                    {r.created_at && (
                      <span className="text-xs text-slate-400 shrink-0">
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
          <p className="text-center text-sm text-slate-500 py-12">
            Search across notes, communications, properties, contacts, and research
          </p>
        )}
      </main>
    </div>
  );
}
