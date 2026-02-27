import { createFileRoute } from "@tanstack/react-router";
import { ServerList } from "@/components/features/dashboard/ServerList.tsx";

export const Route = createFileRoute("/_app/")({
  component: ServersPage,
});

function ServersPage() {
  return <ServerList />;
}
