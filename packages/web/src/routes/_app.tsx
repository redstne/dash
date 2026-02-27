import { createFileRoute, Outlet, Link, useNavigate, redirect, useRouterState } from "@tanstack/react-router";
import { useSession, useSignOut } from "@/hooks/useSession.ts";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import {
  Server, Users, ShieldCheck, LogOut, Zap, ChevronDown, Activity,
  Terminal, Map, Package, FileText, AlertTriangle, BarChart3, Settings, HardDrive, ArrowLeft, Puzzle, Clock, Bell, Shield, ScrollText, Globe2, LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.fetchQuery({
      queryKey: ["session"],
      queryFn: async () => {
        const res = await fetch("/api/auth/get-session", { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      },
      staleTime: 30_000,
    });
    if (!session?.user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const globalNav = [
  { label: "Servers", icon: Server, to: "/" },
  { label: "Members", icon: Users, to: "/members" },
  { label: "Audit Log", icon: ShieldCheck, to: "/audit" },
] as const;

const serverNav = [
  { label: "Overview",  icon: LayoutDashboard, tab: "overview" },
  { label: "Console",   icon: Terminal,       tab: "console" },
  { label: "Logs",      icon: ScrollText,     tab: "logs" },
  { label: "Players",   icon: Users,          tab: "players" },
  { label: "Whitelist", icon: Shield,         tab: "whitelist" },
  { label: "Live Map",  icon: Map,            tab: "map" },
  { label: "Plugins",   icon: Package,        tab: "plugins" },
  { label: "Files",     icon: FileText,       tab: "files" },
  { label: "Worlds",    icon: Globe2,         tab: "worlds" },
  { label: "Alerts",    icon: AlertTriangle,  tab: "alerts" },
  { label: "Analytics", icon: BarChart3,      tab: "analytics" },
  { label: "Backups",   icon: HardDrive,      tab: "backups" },
  { label: "Schedule",  icon: Clock,          tab: "schedule" },
  { label: "Webhooks",  icon: Bell,           tab: "webhooks" },
  { label: "Settings",  icon: Settings,       tab: "settings" },
] as const;

interface ServerItem { id: string; name: string; enabled: boolean; }

function ServerSelector() {
  const navigate = useNavigate();
  const { data: servers = [] } = useQuery<ServerItem[]>({
    queryKey: ["servers"],
    queryFn: () => fetch("/api/servers", { credentials: "include" }).then((r) => r.json()),
  });
  if (servers.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-red-600/30 bg-card hover:bg-accent gap-2">
          <Server className="w-3.5 h-3.5 text-red-500" />
          <span className="hidden sm:inline text-sm">Servers</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {servers.map((s) => (
          <DropdownMenuItem key={s.id}
            onClick={() => void navigate({ to: "/servers/$id/overview", params: { id: s.id } })}
            className="flex items-center gap-2">
            <div className={cn("w-1.5 h-1.5 rounded-full", s.enabled ? "bg-green-500" : "bg-gray-500")} />
            <span>{s.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar() {
  const { data: session } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const routerState = useRouterState();

  const serverMatch = routerState.location.pathname.match(/^\/servers\/([^/]+)\/?(.*)$/);
  const currentServerId = serverMatch?.[1];
  const currentTab = serverMatch?.[2] ?? "";

  const close = () => setOpenMobile(false);

  const { data: pluginsMeta } = useQuery<{ type: "plugins" | "mods" | "none" }>({
    queryKey: ["plugins-meta", currentServerId],
    queryFn: () =>
      fetch(`/api/servers/${currentServerId}/mods`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => ({ type: d.type })),
    enabled: !!currentServerId,
    staleTime: 60_000,
  });

  const resolvedNav = serverNav.map((item) => {
    if (item.tab !== "plugins") return item;
    if (pluginsMeta?.type === "mods") return { ...item, label: "Mods", icon: Puzzle };
    return item;
  });

  async function handleSignOut() {
    await signOut.mutateAsync();
    void navigate({ to: "/login" });
  }

  return (
    <Sidebar collapsible="offcanvas">
      {/* Sidebar header — logo */}
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <Zap className="w-5 h-5 text-red-600 fill-red-600" />
            <div className="absolute inset-0 w-5 h-5 bg-red-600 blur-lg opacity-40 animate-pulse" />
          </div>
          <span className="text-sm font-bold bg-gradient-to-r from-red-500 via-orange-500 to-red-600 bg-clip-text text-transparent">
            redstne.dash
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {currentServerId ? (
                <>
                  {/* Back to servers */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/" onClick={close} className="flex items-center gap-2 text-muted-foreground">
                        <ArrowLeft className="w-4 h-4" />
                        <span>All Servers</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <Separator className="my-1 bg-sidebar-border" />
                  {/* Server tabs */}
                  {resolvedNav.map(({ label, icon: Icon, tab }) => {
                    const isActive = currentTab === tab || (tab === "overview" && !currentTab);
                    return (
                      <SidebarMenuItem key={tab}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => { void navigate({ to: `/servers/${currentServerId}/${tab}` as "/" }); close(); }}
                          className="gap-2"
                        >
                          <Icon className="w-4 h-4" />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </>
              ) : (
                globalNav.map(({ to, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild>
                      <Link
                        to={to}
                        onClick={close}
                        className="flex items-center gap-2"
                        activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground" }}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 space-y-1">
        <p className="text-[11px] text-muted-foreground px-2 truncate">{session?.user?.email}</p>
        <SidebarMenuButton onClick={() => void handleSignOut()} className="w-full gap-2 text-muted-foreground hover:text-foreground">
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}

function AppLayout() {
  const routerState = useRouterState();
  const serverMatch = routerState.location.pathname.match(/^\/servers\/([^/]+)\/?(.*)$/);
  const currentServerId = serverMatch?.[1];
  const currentTab = serverMatch?.[2] ?? "";

  // Console/files need full height without scroll
  const isConsole = currentTab === "console" || currentTab === "" || currentTab === "files" || currentTab === "logs";

  interface ServerStatus { online: boolean; playerCount: number; maxPlayers: number; tps: number | null; }
  const { data: status } = useQuery<ServerStatus>({
    queryKey: ["server-status", currentServerId],
    queryFn: () =>
      fetch(`/api/servers/${currentServerId}/status`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 10_000,
    enabled: !!currentServerId,
    retry: false,
  });

  const isOnline = status?.online ?? false;
  const tpsOk = (status?.tps ?? 20) >= 18;

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Header */}
          <header className="border-b bg-card sticky top-0 z-20 shadow-md shadow-red-600/5">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div className="ml-auto flex items-center gap-2">
                {/* Server status pills — only when on a server page */}
                {currentServerId && status && (
                  <>
                    {/* Online / Offline */}
                    <div className={cn(
                      "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-medium",
                      isOnline
                        ? "bg-green-600/10 border-green-600/20 text-green-400"
                        : "bg-gray-600/10 border-gray-600/20 text-gray-400"
                    )}>
                      <Activity className="w-3 h-3" />
                      {isOnline ? "Online" : "Offline"}
                    </div>
                    {/* Players */}
                    <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full border bg-blue-600/10 border-blue-600/20 text-blue-400 text-[11px] font-medium">
                      <Users className="w-3 h-3" />
                      {status.playerCount}/{status.maxPlayers}
                    </div>
                    {/* TPS */}
                    <div className={cn(
                      "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-medium",
                      status.tps !== null
                        ? tpsOk ? "bg-orange-600/10 border-orange-600/20 text-orange-400" : "bg-red-600/10 border-red-600/20 text-red-400"
                        : "bg-orange-600/10 border-orange-600/20 text-orange-400"
                    )}>
                      <Zap className="w-3 h-3" />
                      {status.tps !== null ? `${status.tps.toFixed(1)} TPS` : "— TPS"}
                    </div>
                  </>
                )}
                <ServerSelector />
                <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded-full bg-red-600/10 border border-red-600/20">
                  <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
                  <span className="text-[10px] font-medium text-red-500">LIVE</span>
                </div>
              </div>
            </div>
          </header>
          {/* Main */}
          <main className={cn("flex-1 min-w-0", isConsole ? "flex flex-col overflow-hidden" : "overflow-auto")}>
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
