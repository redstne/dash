import { createFileRoute } from "@tanstack/react-router";
import { ServerConsole } from "@/components/features/server/ServerConsole.tsx";

export const Route = createFileRoute("/_app/servers/$id/console")({
  component: ConsolePage,
});

function ConsolePage() {
  const { id } = Route.useParams();
  return <ServerConsole serverId={id} />;
}
