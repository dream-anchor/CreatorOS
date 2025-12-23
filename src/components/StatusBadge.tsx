import { PostStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const statusConfig: Record<PostStatus, { label: string; className: string }> = {
  IDEA: { label: "Idee", className: "status-idea" },
  DRAFT: { label: "Entwurf", className: "status-draft" },
  READY_FOR_REVIEW: { label: "Zur Prüfung", className: "status-review" },
  APPROVED: { label: "Genehmigt", className: "status-approved" },
  SCHEDULED: { label: "Geplant", className: "status-scheduled" },
  PUBLISHED: { label: "Veröffentlicht", className: "status-published" },
  FAILED: { label: "Fehlgeschlagen", className: "status-failed" },
  REJECTED: { label: "Abgelehnt", className: "status-rejected" },
};

interface StatusBadgeProps {
  status: PostStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <span className={cn("status-badge", config.className, className)}>
      {config.label}
    </span>
  );
}
