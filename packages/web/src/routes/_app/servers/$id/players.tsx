import { createFileRoute } from "@tanstack/react-router";
import { ServerPlayers } from "@/components/features/server/ServerPlayers.tsx";

export const Route = createFileRoute("/_app/servers/$id/players")({
  component: PlayersPage,
});

function PlayersPage() {
  const { id } = Route.useParams();
  return <ServerPlayers serverId={id} />;
}
