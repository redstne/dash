import { useState } from "react";
import { ServerStats } from "./components/server-stats";
import { Console } from "./components/console";
import { Members } from "./components/members";
import { LiveMap } from "./components/live-map";
import { ServerSelector, MinecraftServer } from "./components/server-selector";
import { Login } from "./components/login";
import { Backups } from "./components/backups";
import {
  Terminal,
  Users,
  Map,
  Settings,
  Package,
  FileText,
  AlertTriangle,
  BarChart3,
  Zap,
  Menu,
  X,
  HardDrive,
} from "lucide-react";
import { Button } from "./components/ui/button";

type Tab = "console" | "members" | "map" | "backups" | "plugins" | "files" | "settings" | "alerts" | "analytics";

const navItems = [
  { id: "console" as Tab, label: "Console", icon: Terminal },
  { id: "members" as Tab, label: "Members", icon: Users },
  { id: "map" as Tab, label: "Live Map", icon: Map },
  { id: "backups" as Tab, label: "Backups", icon: HardDrive },
  { id: "plugins" as Tab, label: "Plugins", icon: Package },
  { id: "files" as Tab, label: "Files", icon: FileText },
  { id: "alerts" as Tab, label: "Alerts", icon: AlertTriangle },
  { id: "analytics" as Tab, label: "Analytics", icon: BarChart3 },
  { id: "settings" as Tab, label: "Settings", icon: Settings },
];

const initialServers: MinecraftServer[] = [
  {
    id: "1",
    name: "Main Survival Server",
    host: "server.example.com",
    port: 25565,
    status: "online",
    players: 12,
    maxPlayers: 50,
    version: "1.20.4",
  },
  {
    id: "2",
    name: "Creative Build Server",
    host: "creative.example.com",
    port: 25566,
    status: "online",
    players: 8,
    maxPlayers: 30,
    version: "1.20.4",
  },
  {
    id: "3",
    name: "Modded Server",
    host: "modded.example.com",
    port: 25567,
    status: "offline",
    players: 0,
    maxPlayers: 20,
    version: "1.19.2",
  },
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("console");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [servers, setServers] = useState<MinecraftServer[]>(initialServers);
  const [currentServer, setCurrentServer] = useState<MinecraftServer | null>(initialServers[0]);

  const handleLogin = (username: string, password: string) => {
    // In a real app, you would validate credentials here
    setIsAuthenticated(true);
  };

  const handleServerCreate = (newServerData: Omit<MinecraftServer, "id" | "status" | "players">) => {
    const newServer: MinecraftServer = {
      ...newServerData,
      id: Date.now().toString(),
      status: "offline",
      players: 0,
    };
    setServers([...servers, newServer]);
    setCurrentServer(newServer);
  };

  const handleServerDelete = (serverId: string) => {
    const updatedServers = servers.filter((s) => s.id !== serverId);
    setServers(updatedServers);
    if (currentServer?.id === serverId) {
      setCurrentServer(updatedServers.length > 0 ? updatedServers[0] : null);
    }
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10 shadow-lg shadow-red-600/5">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden h-8 w-8"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Zap className="w-6 h-6 text-red-600 fill-red-600" />
              <div className="absolute inset-0 w-6 h-6 bg-red-600 blur-lg opacity-50 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold bg-gradient-to-r from-red-500 via-orange-500 to-red-600 bg-clip-text text-transparent">
                redstnkit.dash
              </h1>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ServerSelector
              servers={servers}
              currentServer={currentServer}
              onServerChange={setCurrentServer}
              onServerCreate={handleServerCreate}
              onServerDelete={handleServerDelete}
            />
            <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded-full bg-red-600/10 border border-red-600/20">
              <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
              <span className="text-[10px] font-medium text-red-500">LIVE</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } fixed lg:sticky lg:translate-x-0 top-[57px] left-0 h-[calc(100vh-57px)] w-56 border-r bg-card transition-transform duration-300 z-20`}
        >
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm ${
                    activeTab === item.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 lg:ml-0">
          {currentServer ? (
            <>
              <ServerStats
                status={currentServer.status}
                players={currentServer.players}
                maxPlayers={currentServer.maxPlayers}
                tps={19.8}
                memory={{ used: 4.2, total: 8 }}
              />

              {/* Content based on active tab */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {activeTab === "console" && (
                  <>
                    <div className="lg:col-span-2">
                      <Console />
                    </div>
                  </>
                )}

                {activeTab === "members" && (
                  <>
                    <Members />
                    <div className="space-y-4">
                      <LiveMap />
                    </div>
                  </>
                )}

                {activeTab === "map" && (
                  <div className="lg:col-span-2">
                    <LiveMap />
                  </div>
                )}

                {activeTab === "backups" && (
                  <div className="lg:col-span-2">
                    <Backups />
                  </div>
                )}

                {activeTab === "plugins" && (
                  <div className="lg:col-span-2">
                    <div className="rounded-lg border bg-card p-12 text-center">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Plugins</h3>
                      <p className="text-muted-foreground">
                        Plugin management coming soon. Manage your server plugins, view updates, and
                        configure settings.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "files" && (
                  <div className="lg:col-span-2">
                    <div className="rounded-lg border bg-card p-12 text-center">
                      <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">File Manager</h3>
                      <p className="text-muted-foreground">
                        File management coming soon. Browse, edit, and manage your server files directly
                        from the dashboard.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "alerts" && (
                  <div className="lg:col-span-2">
                    <div className="rounded-lg border bg-card p-12 text-center">
                      <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Alert System</h3>
                      <p className="text-muted-foreground">
                        Alert monitoring coming soon. Set up notifications for server events, player
                        actions, and system warnings.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "analytics" && (
                  <div className="lg:col-span-2">
                    <div className="rounded-lg border bg-card p-12 text-center">
                      <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Server Analytics</h3>
                      <p className="text-muted-foreground">
                        Analytics dashboard coming soon. View detailed statistics, performance graphs,
                        and player activity trends.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "settings" && (
                  <div className="lg:col-span-2">
                    <div className="rounded-lg border bg-card p-12 text-center">
                      <Settings className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Server Settings</h3>
                      <p className="text-muted-foreground">
                        Settings panel coming soon. Configure server properties, game rules, whitelist,
                        and more.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
              <div className="text-center max-w-md mx-auto p-8">
                <div className="relative inline-block mb-6">
                  <div className="p-6 bg-red-600/10 rounded-2xl border border-red-600/30">
                    <Zap className="w-16 h-16 text-red-600 fill-red-600" />
                  </div>
                  <div className="absolute inset-0 bg-red-600 blur-3xl opacity-30 animate-pulse" />
                </div>
                
                <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-red-500 via-orange-500 to-red-600 bg-clip-text text-transparent">
                  No Servers Yet
                </h2>
                
                <p className="text-muted-foreground mb-6">
                  Get started by creating your first Minecraft server. Connect to existing servers or set up a new one to begin managing your worlds.
                </p>
                
                <div className="space-y-3">
                  <ServerSelector
                    servers={servers}
                    currentServer={null}
                    onServerChange={setCurrentServer}
                    onServerCreate={handleServerCreate}
                    onServerDelete={handleServerDelete}
                  />
                </div>

                <div className="mt-8 grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-blue-600/10 border border-blue-600/30">
                    <Terminal className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Console</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-600/10 border border-green-600/30">
                    <Users className="w-5 h-5 text-green-400 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Players</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-600/10 border border-purple-600/30">
                    <HardDrive className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Backups</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}