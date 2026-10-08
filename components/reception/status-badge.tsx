import type { SubscriptionStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n";

export function StatusBadge({
  status,
  dict,
}: {
  status: SubscriptionStatus;
  dict: Dictionary;
}) {
  const map = {
    ACTIVE: { variant: "success" as const, label: dict.status.active },
    EXPIRED: { variant: "destructive" as const, label: dict.status.expired },
    FROZEN: { variant: "warning" as const, label: dict.status.frozen },
    CANCELLED: { variant: "muted" as const, label: dict.status.cancelled },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
