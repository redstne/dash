import { createFileRoute } from "@tanstack/react-router";
import { ServerOverview } from "@/components/features/server/ServerOverview.tsx";

export const Route = createFileRoute("/_app/servers/$id/overview")({
  component: OverviewPage,
});

function OverviewPage() {
  const { id } = Route.useParams();
  return <ServerOverview serverId={id} />;
}
