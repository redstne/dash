import { createFileRoute } from "@tanstack/react-router";
import { ServerAlerts } from "@/components/features/server/ServerAlerts.tsx";

export const Route = createFileRoute("/_app/servers/$id/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const { id } = Route.useParams();
  return <ServerAlerts serverId={id} />;
}
