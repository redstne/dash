import { createFileRoute } from "@tanstack/react-router";
import { ServerPlugins } from "@/components/features/server/ServerPlugins.tsx";

export const Route = createFileRoute("/_app/servers/$id/plugins")({
  component: PluginsPage,
});

function PluginsPage() {
  const { id } = Route.useParams();
  return <ServerPlugins serverId={id} />;
}
