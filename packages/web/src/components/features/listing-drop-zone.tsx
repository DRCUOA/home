import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Home, Loader2, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import type { Project, Property } from "@hcc/shared";

type ListResponse<T> = { data: T[]; total: number };

type Stage = "idle" | "confirm" | "processing" | "success" | "error";

function extractUrl(dataTransfer: DataTransfer): string | null {
  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    const first = uriList.split(/\r?\n/).find((l) => l && !l.startsWith("#"));
    if (first) return first.trim();
  }

  const plain = dataTransfer.getData("text/plain")?.trim();
  if (plain && /^https?:\/\/.+/i.test(plain)) return plain;

  return null;
}

export function ListingDropZone() {
  const qc = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [droppedUrl, setDroppedUrl] = useState("");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const dragCounterRef = useRef(0);

  const reset = useCallback(() => {
    setStage("idle");
    setDroppedUrl("");
    setStatusText("");
    setErrorText("");
  }, []);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) setDragging(true);
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragging(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragging(false);

      if (!e.dataTransfer) return;
      const url = extractUrl(e.dataTransfer);
      if (!url) return;

      setDroppedUrl(url);
      setStage("confirm");
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const handleConfirm = useCallback(async () => {
    setStage("processing");

    try {
      setStatusText("Looking up buy project…");
      const projectsRes = await apiGet<ListResponse<Project>>("/projects?type=buy");
      let buyProject = projectsRes.data[0];

      if (!buyProject) {
        setStatusText("Creating buy project…");
        const created = await apiPost<{ data: Project }>("/projects", {
          type: "buy",
          name: "My purchase",
        });
        buyProject = created.data;
        qc.invalidateQueries({ queryKey: ["projects"] });
      }

      setStatusText("Fetching listing details…");
      let enrichedData: Record<string, any> = {};
      try {
        const preview = await apiPost<{ data: Record<string, any> }>(
          "/properties/enrich-preview",
          { listing_url: droppedUrl }
        );
        enrichedData = preview.data;
      } catch {
        // enrich-preview is best-effort
      }

      setStatusText("Saving property…");
      const propertyPayload = {
        project_id: buyProject.id,
        address: enrichedData.address || new URL(droppedUrl).pathname.split("/").pop() || "Unknown address",
        listing_url: droppedUrl,
        suburb: enrichedData.suburb || undefined,
        city: enrichedData.city || undefined,
        listing_method: enrichedData.listing_method || undefined,
        price_asking: enrichedData.price_asking || undefined,
        bedrooms: enrichedData.bedrooms || undefined,
        bathrooms: enrichedData.bathrooms || undefined,
        property_type: enrichedData.property_type || undefined,
        watchlist_status: "researching",
        is_own_home: false,
      };

      const createRes = await apiPost<{ data: Property }>("/properties", propertyPayload);
      const property = createRes.data;

      setStatusText("Enriching & geolocating…");
      try {
        await apiPost(`/properties/${property.id}/enrich`, {});
      } catch {
        // enrichment is best-effort; geocode already fires on create
      }

      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["map-properties"] });

      setStatusText(enrichedData.address || property.address);
      setStage("success");
    } catch (err: any) {
      setErrorText(err?.message || "Failed to add property");
      setStage("error");
    }
  }, [droppedUrl, qc]);

  const urlDisplay = droppedUrl.length > 80 ? droppedUrl.slice(0, 77) + "…" : droppedUrl;

  return (
    <>
      {dragging && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-primary-600/10 dark:bg-primary-400/10 backdrop-blur-sm" />
          <div className="relative flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary-500 dark:border-primary-400 bg-white/90 dark:bg-slate-900/90 px-10 py-8 shadow-2xl">
            <Home className="h-10 w-10 text-primary-600 dark:text-primary-400" />
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Drop listing URL to add
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              We'll fetch details and add it as a buy prospect
            </p>
          </div>
        </div>
      )}

      <Modal
        open={stage === "confirm"}
        onClose={reset}
        title="Add as buy prospect?"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Add this listing to your buy project? We'll fetch the property
            details and place it on the map.
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 border border-slate-200 dark:border-slate-700">
            <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <p className="text-sm text-primary-600 dark:text-primary-400 break-all">
              {urlDisplay}
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              className="flex-1 min-h-12"
              onClick={reset}
            >
              Cancel
            </Button>
            <Button className="flex-1 min-h-12" onClick={handleConfirm}>
              Add prospect
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={stage === "processing"}
        onClose={() => {}}
        title="Adding prospect…"
      >
        <div className="flex flex-col items-center gap-4 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {statusText}
          </p>
        </div>
      </Modal>

      <Modal open={stage === "success"} onClose={reset} title="Prospect added">
        <div className="flex flex-col items-center gap-4 py-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <div className="text-center">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {statusText}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Property saved and queued for geocoding. Check the map or Buy page.
            </p>
          </div>
          <Button className="min-h-11 w-full" onClick={reset}>
            Done
          </Button>
        </div>
      </Modal>

      <Modal open={stage === "error"} onClose={reset} title="Something went wrong">
        <div className="flex flex-col items-center gap-4 py-6">
          <XCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {errorText}
          </p>
          <Button className="min-h-11 w-full" onClick={reset}>
            Dismiss
          </Button>
        </div>
      </Modal>
    </>
  );
}
