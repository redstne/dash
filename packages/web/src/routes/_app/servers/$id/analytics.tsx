import { createFileRoute } from "@tanstack/react-router";
import { ServerAnalytics } from "@/components/features/server/ServerAnalytics.tsx";

export const Route = createFileRoute("/_app/servers/$id/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { id } = Route.useParams();
  return <ServerAnalytics serverId={id} />;
}
