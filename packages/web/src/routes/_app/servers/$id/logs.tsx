import { createFileRoute } from "@tanstack/react-router";
import { ServerLogs } from "@/components/features/server/ServerLogs.tsx";

export const Route = createFileRoute("/_app/servers/$id/logs")({
  component: LogsPage,
});

function LogsPage() {
  const { id } = Route.useParams();
  return <ServerLogs serverId={id} />;
}
