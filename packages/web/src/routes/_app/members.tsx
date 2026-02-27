import { createFileRoute } from "@tanstack/react-router";
import { MembersPanel } from "@/components/features/members/MembersPanel.tsx";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});

function MembersPage() {
  return <MembersPanel />;
}
