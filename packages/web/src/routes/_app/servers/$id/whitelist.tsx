import { createFileRoute } from "@tanstack/react-router";
import { ServerWhitelist } from "@/components/features/server/ServerWhitelist.tsx";

export const Route = createFileRoute("/_app/servers/$id/whitelist")({
  component: WhitelistPage,
});

function WhitelistPage() {
  const { id } = Route.useParams();
  return <ServerWhitelist serverId={id} />;
}
