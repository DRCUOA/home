import { Badge } from "./badge";
import { capitalize } from "@/lib/format";

const statusColors: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  planning: "default",
  researching: "default",
  listed: "primary",
  open_homes_underway: "primary",
  inspecting: "primary",
  due_diligence: "primary",
  shortlisted: "primary",
  preparing_offer: "warning",
  offer_candidate: "warning",
  offer_received: "warning",
  under_offer: "warning",
  under_contract: "warning",
  conditional: "warning",
  unconditional: "success",
  settled: "success",
  rejected: "danger",
  draft: "default",
  submitted: "primary",
  countered: "warning",
  accepted: "success",
  withdrawn: "danger",
  expired: "danger",
  todo: "default",
  in_progress: "primary",
  waiting: "warning",
  done: "success",
  not_started: "default",
  waiting_on_third_party: "warning",
  complete: "success",
  selected: "success",
  low: "success",
  medium: "warning",
  high: "danger",
  urgent: "danger",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusColors[status] || "default"}>
      {capitalize(status)}
    </Badge>
  );
}
