import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/servers/$id")({
  beforeLoad: ({ location, params }) => {
    if (location.pathname === `/servers/${params.id}` || location.pathname === `/servers/${params.id}/`) {
      throw redirect({ to: "/servers/$id/console", params: { id: params.id } });
    }
  },
  component: () => <Outlet />,
});


