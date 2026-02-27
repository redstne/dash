import { createFileRoute } from "@tanstack/react-router";
import { ServerMap } from "@/components/features/server/ServerMap.tsx";

export const Route = createFileRoute("/_app/servers/$id/map")({
  component: MapPage,
});

function MapPage() {
  const { id } = Route.useParams();
  return <ServerMap serverId={id} />;
}
