import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import {
  Terminal, Users, FolderOpen, Settings, RefreshCw, Square,
  Loader2, Power, PowerOff, Cpu, MemoryStick, Wifi, WifiOff,
  Package, Globe, Clock, Activity, AlertTriangle, Copy, Check,
  ChevronRight, Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { cn } from "@/lib/utils.ts";


interface ServerDetails {
  id: string; name: string; host: string; rconPort: number;
  dynmapUrl: string | null; logPath: string | null; enabled: boolean;
  createdAt: string; dockerContainerId?: string | null;
}

interface ServerStatus {
  online: boolean; players: string[]; playerCount: number;
  maxPlayers: number; tps: number | null;
}

interface CurrentRuntime {
  filename: string | null; runtime: string | null; version: string | null;
}

interface Resources {
  cpuPercent: number | null; memUsedMb: number | null; memTotalMb: number | null;
}

function PlayerHead({ name }: { name: string }) {
  return (
    <div className="relative group" title={name}>
      <img
        src={`https://mc-heads.net/avatar/${name}/24`}
        alt={name}
        className="w-6 h-6 rounded-sm"
        style={{ imageRendering: "pixelated" }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}

const RUNTIME_COLORS: Record<string, string> = {
  paper: "text-blue-400", purpur: "text-purple-400",
  fabric: "text-yellow-400", forge: "text-orange-400", vanilla: "text-green-400",
};

const RUNTIME_LABELS: Record<string, string> = {
  paper: "Paper", purpur: "Purpur", fabric: "Fabric",
  forge: "Forge", vanilla: "Vanilla",
};

function StatCard({ icon: Icon, label, value, sub, colorClass = "text-muted-foreground" }: {
  icon: React.FC<{ className?: string }>;
  label: string; value: React.ReactNode; sub?: string; colorClass?: string;
}) {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <Icon className={cn("w-3.5 h-3.5 mt-0.5", colorClass)} />
        </div>
        <p className={cn("text-xl font-bold mt-1 leading-none", colorClass)}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function ServerOverview({ serverId }: { serverId: string }) {
  const id = serverId;
  const qc = useQueryClient();

  const { data: server } = useQuery<ServerDetails>({
    queryKey: ["server", id],
    queryFn: () => fetch(`/api/servers/${id}`, { credentials: "include" }).then((r) => r.json()),
  });

  const [transition, setTransition] = useState<"idle" | "starting" | "stopping">("idle");

  const { data: status, isLoading: statusLoading } = useQuery<ServerStatus>({
    queryKey: ["server-status", id],
    queryFn: () => fetch(`/api/servers/${id}/status`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: transition !== "idle" ? 3_000 : 10_000,
    staleTime: transition !== "idle" ? 1_000 : 8_000,
  });

  const { data: runtime } = useQuery<CurrentRuntime>({
    queryKey: ["runtime-current", id],
    queryFn: () => fetch(`/api/servers/${id}/runtime/current`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: resources } = useQuery<Resources>({
    queryKey: ["server-resources", id],
    queryFn: () => fetch(`/api/servers/${id}/resources`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // Detect transition end
  const prevOnline = useRef<boolean | null>(null);
  useEffect(() => {
    if (status == null) return;
    const prev = prevOnline.current;
    prevOnline.current = status.online;
    if (prev === null) return;
    if (transition === "starting" && status.online) setTransition("idle");
    if (transition === "stopping" && !status.online) setTransition("idle");
  }, [status?.online, transition]);

  const powerMutation = useMutation({
    mutationFn: (cmd: "start" | "stop" | "restart") =>
      fetch(`/api/servers/${id}/action/${cmd}`, { method: "POST", credentials: "include" }).then((r) => {
        if (!r.ok) return r.text().then((t) => Promise.reject(new Error(t)));
        return r.json();
      }),
    onMutate: (cmd) => {
      setTransition(cmd === "start" ? "starting" : cmd === "stop" ? "stopping" : "stopping");
      setConfirmAction(null);
    },
    onError: () => setTransition("idle"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["server-status", id] }),
  });

  const [confirmAction, setConfirmAction] = useState<"stop" | "restart" | null>(null);
  const [copied, setCopied] = useState(false);

  const online = status?.online ?? false;
  const isTransitioning = transition !== "idle";
  const canStart = !online && !!server?.dockerContainerId && !isTransitioning;
  const canStop = online && !isTransitioning;

  const tpsColor = !status?.tps ? "text-muted-foreground"
    : status.tps >= 18 ? "text-green-400"
    : status.tps >= 15 ? "text-yellow-400"
    : "text-red-400";

  const statusColor = isTransitioning ? "border-yellow-600/40 text-yellow-400 bg-yellow-600/10"
    : online ? "border-green-600/40 text-green-400 bg-green-600/10"
    : "border-gray-600/40 text-gray-400 bg-gray-600/10";

  const dotColor = isTransitioning ? "bg-yellow-400 animate-pulse"
    : online ? "bg-green-400 animate-pulse"
    : "bg-gray-500";

  const statusLabel = transition === "starting" ? "Starting…"
    : transition === "stopping" ? "Stopping…"
    : online ? `Online · ${status!.playerCount}/${status!.maxPlayers}`
    : "Offline";

  const serverAddress = server ? `${server.host}` : "";

  function copyAddress() {
    void navigator.clipboard.writeText(serverAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const rtColor = runtime?.runtime ? (RUNTIME_COLORS[runtime.runtime] ?? "text-muted-foreground") : "text-muted-foreground";
  const rtLabel = runtime?.runtime ? (RUNTIME_LABELS[runtime.runtime] ?? runtime.runtime) : null;

  return (
    <div className="p-4 space-y-4 w-full">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Server icon */}
          <div className="relative">
            <img
              src={`/api/servers/${id}/icon`}
              alt="server icon"
              className="w-12 h-12 rounded-lg border border-border/50"
              style={{ imageRendering: "pixelated" }}
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.nextElementSibling?.classList.remove("hidden");
              }}
            />
            <div className="hidden w-12 h-12 rounded-lg border border-border/50 bg-red-600/10 flex items-center justify-center">
              <span className="text-2xl">⚔️</span>
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{server?.name ?? "…"}</h1>
            <button
              onClick={copyAddress}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono group"
            >
              {serverAddress}
              {copied
                ? <Check className="w-3 h-3 text-green-400" />
                : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
          </div>
        </div>

        {/* Status + power controls */}
        <div className="flex items-center gap-2">
          {statusLoading ? (
            <Badge variant="outline" className="border-muted text-muted-foreground">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />…
            </Badge>
          ) : (
            <Badge variant="outline" className={cn("transition-all duration-500 text-xs", statusColor)}>
              <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5 transition-colors duration-500", dotColor)} />
              {statusLabel}
            </Badge>
          )}

          {isTransitioning ? (
            <Button variant="outline" size="sm" disabled className="h-8 gap-1.5 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400" />
              {transition === "starting" ? "Starting…" : "Stopping…"}
            </Button>
          ) : canStart ? (
            <Button variant="outline" size="sm"
              className="h-8 gap-1.5 text-xs border-green-600/30 text-green-400 hover:bg-green-600/10"
              onClick={() => powerMutation.mutate("start")}>
              <Power className="w-3.5 h-3.5" /> Start
            </Button>
          ) : canStop ? (
            <>
              <Button variant="outline" size="sm"
                className="h-8 gap-1.5 text-xs border-orange-600/30 text-orange-400 hover:bg-orange-600/10"
                onClick={() => setConfirmAction("restart")}>
                <RefreshCw className="w-3.5 h-3.5" /> Restart
              </Button>
              <Button variant="outline" size="sm"
                className="h-8 gap-1.5 text-xs border-red-600/30 text-red-400 hover:bg-red-600/10"
                onClick={() => setConfirmAction("stop")}>
                <PowerOff className="w-3.5 h-3.5" /> Stop
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label="Players"
          value={statusLoading ? "…" : online ? `${status!.playerCount}/${status!.maxPlayers}` : "—"}
          colorClass={online ? "text-foreground" : "text-muted-foreground"}
        />
        <StatCard
          icon={Activity}
          label="TPS"
          value={statusLoading ? "…" : (status?.tps != null ? status.tps.toFixed(1) : "—")}
          sub={status?.tps != null ? (status.tps >= 18 ? "Excellent" : status.tps >= 15 ? "Good" : "Lagging") : undefined}
          colorClass={tpsColor}
        />
        <StatCard
          icon={Cpu}
          label="CPU"
          value={resources?.cpuPercent != null ? `${resources.cpuPercent.toFixed(1)}%` : "—"}
          colorClass={
            resources?.cpuPercent == null ? "text-muted-foreground"
            : resources.cpuPercent > 80 ? "text-red-400"
            : resources.cpuPercent > 50 ? "text-yellow-400"
            : "text-green-400"
          }
        />
        <StatCard
          icon={MemoryStick}
          label="RAM"
          value={resources?.memUsedMb != null ? `${Math.round(resources.memUsedMb / 1024 * 10) / 10} GB` : "—"}
          sub={resources?.memTotalMb != null ? `of ${Math.round(resources.memTotalMb / 1024 * 10) / 10} GB` : undefined}
          colorClass="text-foreground"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Players online ─────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Online Players
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {!online ? (
              <p className="text-xs text-muted-foreground italic">Server offline</p>
            ) : status?.players.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No players online</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(status?.players ?? []).map((p) => (
                  <Link key={p} to="/servers/$id/players/$name" params={{ id, name: p }}>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors">
                      <PlayerHead name={p} />
                      <span className="text-xs font-medium">{p}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Quick links ────────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5" /> Quick Access
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Console",  icon: Terminal,   tab: "console" },
                { label: "Players",  icon: Users,      tab: "players" },
                { label: "Files",    icon: FolderOpen, tab: "files" },
                { label: "Plugins",  icon: Package,    tab: "plugins" },
                { label: "Worlds",   icon: Globe,      tab: "worlds" },
                { label: "Settings", icon: Settings,   tab: "settings" },
                { label: "Backups",  icon: Clock,      tab: "backups" },
                { label: "Alerts",   icon: AlertTriangle, tab: "alerts" },
              ].map(({ label, icon: Icon, tab }) => (
                <Link key={tab} to={`/servers/$id/${tab}` as never} params={{ id } as never}>
                  <button className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {label}
                  </button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Server info ────────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" /> Server Info
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            <Row label="Address" value={<span className="font-mono">{server?.host}:{server?.rconPort ? server.rconPort - 15000 || 25565 : 25565}</span>} />
            <Row label="RCON Port" value={<span className="font-mono">{server?.rconPort}</span>} />
            <Row label="Software" value={
              rtLabel ? (
                <span className={cn("font-medium", rtColor)}>
                  {rtLabel}{runtime?.version ? ` ${runtime.version}` : ""}
                </span>
              ) : <span className="text-muted-foreground italic">Unknown</span>
            } />
            <Row label="Log Path" value={
              server?.logPath
                ? <span className="font-mono text-[10px] truncate max-w-[160px]">{server.logPath}</span>
                : <span className="text-muted-foreground italic">Not set</span>
            } />
            {server?.dynmapUrl && (
              <Row label="Live Map" value={
                <a href={server.dynmapUrl} target="_blank" rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-[11px]">
                  Open Map ↗
                </a>
              } />
            )}
            <Row label="Added" value={
              server ? new Date(server.createdAt).toLocaleDateString() : "…"
            } />
          </CardContent>
        </Card>

        {/* ── Whitelist / security ───────────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Status Page
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-3">
            <p className="text-xs text-muted-foreground">Share a public status page for this server — no login required.</p>
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20 border border-border/50">
              <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">
                {typeof window !== "undefined" ? `${window.location.origin}/status/${id}` : `/status/${id}`}
              </span>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}/status/${id}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Link to={`/status/${id}` as never} target="_blank">
              <Button variant="outline" size="sm" className="h-7 text-xs w-full gap-1.5 border-border/50">
                <WifiOff className="w-3 h-3" /> Open Status Page
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Confirm dialogs */}
      <AlertDialog open={confirmAction === "stop"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop {server?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This will gracefully shut down the Minecraft server.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => powerMutation.mutate("stop")}>
              <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === "restart"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart {server?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The server will stop and restart. Players will be disconnected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-700"
              onClick={() => powerMutation.mutate("restart")}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right">{value}</span>
    </div>
  );
}
