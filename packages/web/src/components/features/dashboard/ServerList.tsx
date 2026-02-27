import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Terminal, Users, Map, FolderOpen, PlusCircle, Trash2, Server, Wifi, Check, Loader2, Zap, HardDrive, Settings, Power, PowerOff } from "lucide-react";
import { useSession } from "@/hooks/useSession.ts";
import { cn } from "@/lib/utils.ts";


interface ServerItem {
  id: string;
  name: string;
  host: string;
  rconPort: number;
  enabled: boolean;
  dockerContainerId?: string | null;
}

interface ServerStatus {
  online: boolean;
  players: string[];
  playerCount: number;
  maxPlayers: number;
  tps: number | null;
}

// ── Player head avatar ─────────────────────────────────────────────────────

function PlayerHead({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <img
      src={`https://mc-heads.net/avatar/${name}/${size * 2}`}
      alt={name}
      title={name}
      width={size}
      height={size}
      className="rounded-sm border border-white/10 shrink-0"
      style={{ imageRendering: "pixelated" }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

export function ServerList() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const isAdmin = session?.user?.role === "admin";
  const [showAdd, setShowAdd] = useState(false);

  const { data: servers = [], isLoading } = useQuery<ServerItem[]>({
    queryKey: ["servers"],
    queryFn: async () => {
      const res = await fetch("/api/servers", { credentials: "include" });
      return res.json() as Promise<ServerItem[]>;
    },
  });

  const deleteServer = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/servers/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your Minecraft servers</p>
        </div>
        {isAdmin && servers.length > 0 && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-red-600 hover:bg-red-700">
                <PlusCircle className="h-4 w-4" />
                Add Server
              </Button>
            </DialogTrigger>
            <DialogContent className="border-red-600/30">
              <DialogHeader><DialogTitle>Add Server</DialogTitle></DialogHeader>
              <AddServerForm onClose={() => setShowAdd(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : servers.length === 0 ? (
        <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
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
            {isAdmin && (
              <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogTrigger asChild>
                  <Button className="bg-red-600 hover:bg-red-700 w-full">
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Your First Server
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-red-600/30">
                  <DialogHeader><DialogTitle>Add Server</DialogTitle></DialogHeader>
                  <AddServerForm onClose={() => setShowAdd(false)} />
                </DialogContent>
              </Dialog>
            )}
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              isAdmin={isAdmin}
              onDelete={() => deleteServer.mutate(server.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ServerCard({ server, isAdmin, onDelete }: {
  server: ServerItem;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // "idle" | "starting" | "stopping"
  const [transition, setTransition] = useState<"idle" | "starting" | "stopping">("idle");

  const { data: status, isLoading: statusLoading } = useQuery<ServerStatus>({
    queryKey: ["server-status", server.id],
    queryFn: () => fetch(`/api/servers/${server.id}/status`, { credentials: "include" }).then((r) => r.json()),
    // Poll faster during transitions so we catch the state change quickly
    refetchInterval: transition !== "idle" ? 3_000 : 15_000,
    staleTime: transition !== "idle" ? 1_000 : 10_000,
  });

  const online = status?.online ?? false;
  const players = status?.players ?? [];
  const MAX_HEADS = 8;
  const visiblePlayers = players.slice(0, MAX_HEADS);
  const overflow = players.length - MAX_HEADS;

  // Detect state change after transition and clear transition flag
  const prevOnlineRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (status == null) return;
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = status.online;
    if (prev === null) return;
    if (transition === "starting" && status.online) setTransition("idle");
    if (transition === "stopping" && !status.online) setTransition("idle");
  }, [status?.online, transition]);

  const powerMutation = useMutation({
    mutationFn: (cmd: "start" | "stop") =>
      fetch(`/api/servers/${server.id}/action/${cmd}`, { method: "POST", credentials: "include" }).then((r) => {
        if (!r.ok) return r.text().then((t) => Promise.reject(new Error(t)));
        return r.json();
      }),
    onMutate: (cmd) => setTransition(cmd === "start" ? "starting" : "stopping"),
    onError: () => setTransition("idle"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["server-status", server.id] }),
  });

  const isTransitioning = transition !== "idle";

  // Status badge label
  const badgeLabel = transition === "starting"
    ? "Starting…"
    : transition === "stopping"
    ? "Stopping…"
    : online
    ? `${status!.playerCount}/${status!.maxPlayers}`
    : "Offline";

  const badgeClass = transition !== "idle"
    ? "border-yellow-600/40 text-yellow-400 bg-yellow-600/10"
    : online
    ? "border-green-600/40 text-green-400 bg-green-600/10"
    : "border-gray-600/40 text-gray-400 bg-gray-600/10";

  const dotClass = transition !== "idle"
    ? "bg-yellow-400 animate-pulse"
    : online
    ? "bg-green-400 animate-pulse"
    : "bg-gray-400";

  const canStart = !online && !!server.dockerContainerId && transition === "idle";
  const canStop = online && transition === "idle";

  return (
    <Card
      className="border-red-600/20 bg-card hover:border-red-600/40 transition-colors flex flex-col cursor-pointer"
      onClick={() => void navigate({ to: "/servers/$id/overview", params: { id: server.id } })}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-red-600/10 shrink-0">
              <Server className="w-4 h-4 text-red-500" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold truncate">{server.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">
                {server.host}:{server.rconPort}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Power button */}
            {isTransitioning ? (
              <Button variant="ghost" size="icon" disabled className="h-6 w-6">
                <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />
              </Button>
            ) : canStart ? (
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 text-green-500 hover:text-green-400 hover:bg-green-600/10"
                title="Start server"
                onClick={() => powerMutation.mutate("start")}
              >
                <Power className="h-3 w-3" />
              </Button>
            ) : canStop ? (
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-600/10"
                title="Stop server"
                onClick={() => powerMutation.mutate("stop")}
              >
                <PowerOff className="h-3 w-3" />
              </Button>
            ) : null}

            {/* Status badge */}
            {statusLoading ? (
              <Badge variant="outline" className="border-muted text-muted-foreground">
                <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />…
              </Badge>
            ) : (
              <Badge variant="outline" className={cn("transition-all duration-500", badgeClass)}>
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1 transition-colors duration-500", dotClass)} />
                {badgeLabel}
              </Badge>
            )}
          </div>
        </div>

        {/* TPS indicator (online only) */}
        {online && status?.tps != null && (
          <div className="flex items-center gap-1.5 mt-1">
            <div className={cn("w-1.5 h-1.5 rounded-full", status.tps >= 18 ? "bg-green-400" : status.tps >= 15 ? "bg-yellow-400" : "bg-red-400")} />
            <span className="text-[10px] text-muted-foreground font-mono">{status.tps.toFixed(1)} TPS</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3 flex-1">
        {/* Player heads row */}
        <div className="min-h-[28px] flex items-center">
          {statusLoading ? (
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-5 h-5 rounded-sm bg-muted animate-pulse" />
              ))}
            </div>
          ) : online && players.length > 0 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {visiblePlayers.map((p) => <PlayerHead key={p} name={p} size={20} />)}
              {overflow > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono ml-0.5">+{overflow}</span>
              )}
            </div>
          ) : online ? (
            <span className="text-xs text-muted-foreground italic">No players online</span>
          ) : transition === "starting" ? (
            <span className="text-xs text-yellow-400/80 italic">Server is starting…</span>
          ) : (
            <span className="text-xs text-muted-foreground italic">Server offline</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Link to="/servers/$id/overview" params={{ id: server.id }}>
            <Button variant="outline" size="sm" className="border-red-600/20 hover:border-red-600/40 hover:bg-red-600/10 text-xs h-7">
              <Terminal className="h-3 w-3" />Console
            </Button>
          </Link>
          <Link to="/servers/$id/players" params={{ id: server.id }}>
            <Button variant="outline" size="sm" className="border-red-600/20 hover:border-red-600/40 hover:bg-red-600/10 text-xs h-7">
              <Users className="h-3 w-3" />Players
            </Button>
          </Link>
          <Link to="/servers/$id/files" params={{ id: server.id }} search={{ path: "/", file: undefined }}>
            <Button variant="outline" size="sm" className="border-red-600/20 hover:border-red-600/40 hover:bg-red-600/10 text-xs h-7">
              <FolderOpen className="h-3 w-3" />Files
            </Button>
          </Link>
          <Link to="/servers/$id/settings" params={{ id: server.id }}>
            <Button variant="outline" size="sm" className="border-red-600/20 hover:border-red-600/40 hover:bg-red-600/10 text-xs h-7">
              <Settings className="h-3 w-3" />Settings
            </Button>
          </Link>
        </div>

        {isAdmin && (
          <Button variant="ghost" size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs self-start h-7 -mt-1"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-3 w-3" />Remove
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
function AddServerForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [rconPort, setRconPort] = useState("25575");
  const [rconPassword, setRconPassword] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<{ host: string; hostname: string | null; rconPort: number; hasRcon: boolean; hasMinecraft: boolean }[]>([]);
  const [scannedSubnets, setScannedSubnets] = useState<string[]>([]);

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/servers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          host,
          rconPort: Number(rconPort),
          rconPassword,
        }),
      });
      if (!res.ok) {
        const e = await res.json() as { message?: string };
        throw new Error(e.message ?? "Failed to add server");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["servers"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  async function scanNetwork() {
    setScanning(true);
    setDiscovered([]);
    setError("");
    try {
      const res = await fetch(`/api/servers/discover`, { credentials: "include" });
      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json() as { hosts: typeof discovered; scannedSubnets: string[] };
      setDiscovered(data.hosts);
      setScannedSubnets(data.scannedSubnets ?? []);
      if (data.hosts.length === 0) setError(`No Minecraft servers found on ${(data.scannedSubnets ?? []).join(", ")}.0/24`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  function selectDiscovered(entry: typeof discovered[0]) {
    setHost(entry.hostname ?? entry.host);
    setRconPort(String(entry.rconPort));
    setDiscovered([]);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      {/* Network scan section */}
      <div className="rounded-lg border border-red-600/20 bg-red-600/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-red-400">Auto-discover</p>
            <p className="text-[11px] text-muted-foreground">Scan local network for Minecraft servers (port 25575 / 25565)</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-600/30 hover:bg-red-600/10 text-red-400 shrink-0"
            onClick={() => { void scanNetwork(); }}
            disabled={scanning}
          >
            {scanning ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Scanning…</>
            ) : (
              <><Wifi className="w-3 h-3 mr-1" />Scan Network</>
            )}
          </Button>
        </div>

        {discovered.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-[10px] text-muted-foreground">
              Found {discovered.length} host{discovered.length !== 1 ? "s" : ""} — click to prefill:
            </p>
            {discovered.map((d) => (
              <button
                key={d.host}
                type="button"
                onClick={() => selectDiscovered(d)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border border-green-600/30 bg-green-600/10 hover:bg-green-600/20 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <div>
                    <span className="text-xs font-mono text-green-300">{d.hostname ?? d.host}</span>
                    {d.hostname && <span className="block text-[9px] text-muted-foreground">{d.host}</span>}
                  </div>
                  {d.hasRcon && <Badge className="text-[9px] h-3.5 px-1 bg-orange-600/20 text-orange-400 border-orange-600/30">RCON</Badge>}
                  {d.hasMinecraft && <Badge className="text-[9px] h-3.5 px-1 bg-green-600/20 text-green-400 border-green-600/30">MC</Badge>}
                </div>
                <Check className="w-3 h-3 text-green-400" />
              </button>
            ))}
          </div>
        )}

        {scannedSubnets.length > 0 && discovered.length === 0 && !scanning && (
          <p className="text-[10px] text-muted-foreground">
            Scanned: {scannedSubnets.map((s) => `${s}.0/24`).join(", ")}
          </p>
        )}
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Server name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border-red-600/20 focus-visible:ring-red-600"
        />
        <Input
          placeholder="Host / IP"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          required
          className="border-red-600/20 focus-visible:ring-red-600"
        />
        <Input
          placeholder="RCON port"
          type="number"
          value={rconPort}
          onChange={(e) => setRconPort(e.target.value)}
          required
          className="border-red-600/20 focus-visible:ring-red-600"
        />
        <Input
          placeholder="RCON password"
          type="password"
          value={rconPassword}
          onChange={(e) => setRconPassword(e.target.value)}
          required
          className="border-red-600/20 focus-visible:ring-red-600"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="bg-red-600 hover:bg-red-700" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add Server"}
        </Button>
      </div>
    </form>
  );
}
