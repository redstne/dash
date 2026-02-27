import { createFileRoute } from "@tanstack/react-router";
import { ServerWebhooks } from "@/components/features/server/ServerWebhooks.tsx";

export const Route = createFileRoute("/_app/servers/$id/webhooks")({
  component: WebhooksPage,
});

function WebhooksPage() {
  const { id } = Route.useParams();
  return <ServerWebhooks serverId={id} />;
}
