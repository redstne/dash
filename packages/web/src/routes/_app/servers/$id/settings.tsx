import { createFileRoute } from "@tanstack/react-router";
import { ServerSettings } from "@/components/features/server/ServerSettings.tsx";

export const Route = createFileRoute("/_app/servers/$id/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { id } = Route.useParams();
  return <ServerSettings serverId={id} />;
}
