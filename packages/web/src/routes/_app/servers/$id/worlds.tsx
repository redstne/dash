import { createFileRoute } from "@tanstack/react-router";
import { ServerWorlds } from "@/components/features/server/ServerWorlds.tsx";

export const Route = createFileRoute("/_app/servers/$id/worlds")({
  component: WorldsPage,
});

function WorldsPage() {
  const { id } = Route.useParams();
  return <ServerWorlds serverId={id} />;
}
