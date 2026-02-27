import { createFileRoute } from "@tanstack/react-router";
import { ServerSchedule } from "@/components/features/server/ServerSchedule.tsx";

export const Route = createFileRoute("/_app/servers/$id/schedule")({
  component: SchedulePage,
});

function SchedulePage() {
  const { id } = Route.useParams();
  return <ServerSchedule serverId={id} />;
}
