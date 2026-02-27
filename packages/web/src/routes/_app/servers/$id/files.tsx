import { createFileRoute } from "@tanstack/react-router";
import { ServerFiles } from "@/components/features/server/ServerFiles.tsx";

export const Route = createFileRoute("/_app/servers/$id/files")({
  validateSearch: (s: Record<string, unknown>) => ({
    path: typeof s.path === "string" ? s.path : "/",
    file: typeof s.file === "string" ? s.file : undefined as string | undefined,
  }),
  component: FilesPage,
});

function FilesPage() {
  const { id } = Route.useParams();
  return <ServerFiles serverId={id} />;
}
