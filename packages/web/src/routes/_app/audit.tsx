import { createFileRoute } from "@tanstack/react-router";
import { AuditLog } from "@/components/features/audit/AuditLog.tsx";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  return <AuditLog />;
}
