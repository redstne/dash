import { createFileRoute } from "@tanstack/react-router";
import { ServerPlayerDetail } from "@/components/features/server/ServerPlayerDetail.tsx";

export const Route = createFileRoute("/_app/servers/$id/players/$name")({
  component: PlayerDetailPage,
});

function PlayerDetailPage() {
  const { id, name } = Route.useParams();
  return <ServerPlayerDetail serverId={id} playerName={name} />;
}
