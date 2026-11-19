import { Badge } from "@/components/ui/primitives";

export function StatusBadge({ status, past }: { status: string; past?: boolean }) {
  if (status === "cancelled") return <Badge tone="danger">Cancelled</Badge>;
  if (status === "draft") return <Badge>Draft</Badge>;
  if (past) return <Badge>Ended</Badge>;
  return <Badge tone="accent">● Live</Badge>;
}
