import { createFileRoute } from "@tanstack/react-router";
import { ServerBackups } from "@/components/features/server/ServerBackups.tsx";

export const Route = createFileRoute("/_app/servers/$id/backups")({
  component: BackupsPage,
});

function BackupsPage() {
  const { id } = Route.useParams();
  return <ServerBackups serverId={id} />;
}
