import { createFileRoute } from "@tanstack/react-router";
import { ServerRuntime } from "@/components/features/server/ServerRuntime.tsx";

export const Route = createFileRoute("/_app/servers/$id/runtime")({
  component: RuntimePage,
});

function RuntimePage() {
  const { id } = Route.useParams();
  return <ServerRuntime serverId={id} />;
}
