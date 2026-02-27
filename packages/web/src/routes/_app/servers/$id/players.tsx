import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Users, UserX, Shield, Search, MapPin, Heart, Utensils,
  Star, Sword, Skull, Clock, Footprints, Pickaxe, Hammer,
  ChevronRight, Activity,
} from "lucide-react";

export const Route = createFileRoute("/_app/servers/$id/players")({
  component: PlayersPage,
});

type Filter = "all" | "online" | "offline";

interface PlayerDetails {
  name: string;
  uuid: string | null;
  online: boolean;
  lastSeen: string | null;
  lastLoginPos: [number, number, number] | null;
  stats: {
    deaths: number; mobKills: number; playerKills: number; playTimeTicks: number;
    jumpCount: number; damageTaken: number; damageDealt: number;
    walkCm: number; sprintCm: number; flyCm: number;
    blocksMined: number; itemsCrafted: number;
    topMinedBlocks: [string, number][]; killedBy: [string, number][]; topKilled: [string, number][];
  } | null;
  advancements: { completed: number } | null;
  liveData: {
    health: number | null; maxHealth: number; food: number | null; saturation: number | null;
    xpLevel: number | null; xpProgress: number | null;
    pos: [number, number, number] | null; dimension: string | null;
  } | null;
  recentActivity: string[];
}

function fmt(ticks: number) {
  const h = Math.floor(ticks / 72000);
  const m = Math.floor((ticks % 72000) / 1200);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDist(cm: number) {
  const km = cm / 100000;
  return km >= 1 ? `${km.toFixed(1)} km` : `${(cm / 100).toFixed(0)} m`;
}
function fmtMob(id: string) {
  return id.replace("minecraft:", "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function PlayerDetailsSheet({ serverId, playerName, open, onClose }: {
  serverId: string; playerName: string | null; open: boolean; onClose: () => void;
}) {
  const { data, isLoading } = useQuery<PlayerDetails>({
    queryKey: ["player-details", serverId, playerName],
    queryFn: () =>
      fetch(`/api/servers/${serverId}/players/${encodeURIComponent(playerName!)}/details`, { credentials: "include" })
        .then((r) => r.json()),
    enabled: open && !!playerName,
    refetchInterval: open ? 15_000 : false,
  });

  const dimLabel = (dim: string | null) =>
    dim === "minecraft:overworld" ? "Overworld" : dim === "minecraft:the_nether" ? "Nether" : dim === "minecraft:the_end" ? "The End" : dim ?? "Unknown";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="right">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 rounded-md">
              <AvatarImage src={`https://mc-heads.net/avatar/${playerName}/48`} className="rounded-md" />
              <AvatarFallback className="rounded-md bg-green-600/20 text-green-400 text-lg font-bold">
                {playerName?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle className="text-lg">{playerName}</SheetTitle>
              {isLoading ? <Skeleton className="h-4 w-16 mt-1" /> : (
                <div className="flex items-center gap-2 mt-0.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${data?.online ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                  <span className="text-xs text-muted-foreground">{data?.online ? "Online" : "Offline"}</span>
                  {data?.advancements && (
                    <span className="text-xs text-muted-foreground">· {data.advancements.completed} advancements</span>
                  )}
                  {data?.uuid && (
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[140px]" title={data.uuid}>
                      · {data.uuid.slice(0, 8)}…
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-8">Failed to load player data.</p>
        ) : (
          <div className="space-y-4">
            {/* Live data (online only) */}
            {data.liveData && (
              <Card className="border-green-600/20 bg-green-950/10">
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-green-400">
                    <Activity className="w-3.5 h-3.5" /> Live
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-3">
                  {data.liveData.health !== null && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 text-muted-foreground"><Heart className="w-3 h-3 text-red-400" /> Health</span>
                        <span>{data.liveData.health.toFixed(1)} / {data.liveData.maxHealth}</span>
                      </div>
                      <Progress value={(data.liveData.health / data.liveData.maxHealth) * 100} className="h-2 [&>div]:bg-red-500" />
                    </div>
                  )}
                  {data.liveData.food !== null && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 text-muted-foreground"><Utensils className="w-3 h-3 text-orange-400" /> Food</span>
                        <span>{data.liveData.food} / 20</span>
                      </div>
                      <Progress value={(data.liveData.food / 20) * 100} className="h-2 [&>div]:bg-orange-500" />
                    </div>
                  )}
                  {data.liveData.xpLevel !== null && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 text-muted-foreground"><Star className="w-3 h-3 text-yellow-400" /> XP</span>
                        <span>Level {data.liveData.xpLevel}</span>
                      </div>
                      <Progress value={(data.liveData.xpProgress ?? 0) * 100} className="h-2 [&>div]:bg-yellow-500" />
                    </div>
                  )}
                  {data.liveData.pos && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
                      <span className="text-muted-foreground">
                        {data.liveData.pos.map((v) => Math.floor(v)).join(", ")}
                        {data.liveData.dimension && ` (${dimLabel(data.liveData.dimension)})`}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Last login position (offline) */}
            {!data.liveData && data.lastLoginPos && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                Last login: {data.lastLoginPos.map((v) => Math.floor(v)).join(", ")}
              </div>
            )}

            {/* Stats grid */}
            {data.stats && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold">Statistics</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: Skull, label: "Deaths", value: data.stats.deaths, color: "text-red-400" },
                      { icon: Sword, label: "Mob Kills", value: data.stats.mobKills, color: "text-orange-400" },
                      { icon: Clock, label: "Playtime", value: fmt(data.stats.playTimeTicks), color: "text-blue-400" },
                      { icon: Footprints, label: "Distance", value: fmtDist(data.stats.walkCm + data.stats.sprintCm), color: "text-green-400" },
                      { icon: Pickaxe, label: "Blocks Mined", value: data.stats.blocksMined.toLocaleString(), color: "text-yellow-400" },
                      { icon: Hammer, label: "Items Crafted", value: data.stats.itemsCrafted.toLocaleString(), color: "text-purple-400" },
                    ].map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="flex items-center gap-2 bg-muted/20 rounded p-2">
                        <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                          <p className="text-xs font-semibold truncate">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {data.stats.damageTaken > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Damage taken: <b className="text-foreground">{(data.stats.damageTaken / 2).toFixed(1)} ❤</b></span>
                      <span>Damage dealt: <b className="text-foreground">{(data.stats.damageDealt / 2).toFixed(1)} ❤</b></span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Top mined blocks */}
            {(data.stats?.topMinedBlocks?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5"><Pickaxe className="w-3 h-3" /> Top Mined</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-1">
                  {data.stats!.topMinedBlocks.map(([block, count]) => (
                    <div key={block} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{fmtMob(block)}</span>
                      <span className="font-medium">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Killed by */}
            {(data.stats?.killedBy?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5"><Skull className="w-3 h-3 text-red-400" /> Killed By</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-1">
                  {data.stats!.killedBy.map(([mob, count]) => (
                    <div key={mob} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{fmtMob(mob)}</span>
                      <span className="font-medium">{count}×</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recent activity */}
            {data.recentActivity.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <ul className="space-y-1">
                    {data.recentActivity.map((line, i) => (
                      <li key={i} className="text-[10px] text-muted-foreground font-mono truncate" title={line}>
                        <ChevronRight className="inline w-2.5 h-2.5 mr-0.5" />{line}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PlayersPage() {
  const { id } = Route.useParams();
  const [players, setPlayers] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [action, setAction] = useState<{ type: "kick" | "ban"; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("online");
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const { data: historyData } = useQuery({
    queryKey: ["players-history", id],
    queryFn: () =>
      fetch(`/api/servers/${id}/players/history`, { credentials: "include" })
        .then((r) => r.json()) as Promise<{ players: string[] }>,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/servers/${id}/players`);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; data?: string[] };
        if (msg.type === "players" && Array.isArray(msg.data)) setPlayers(msg.data);
      } catch {}
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [id]);

  const onlineSet = new Set(players);
  const allKnown = [...new Set([...players, ...(historyData?.players ?? [])])].sort((a, b) => a.localeCompare(b));

  const displayed = allKnown.filter((name) => {
    if (filter === "online" && !onlineSet.has(name)) return false;
    if (filter === "offline" && onlineSet.has(name)) return false;
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function executeAction() {
    if (!action) return;
    setLoading(true);
    try {
      await fetch(`/api/servers/${id}/players/${encodeURIComponent(action.name)}/${action.type}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      setPlayers((prev) => prev.filter((p) => p !== action.name));
    } finally {
      setLoading(false);
      setAction(null);
      setReason("");
    }
  }

  const filterLabels: { key: Filter; label: string }[] = [
    { key: "online", label: `Online (${players.length})` },
    { key: "offline", label: `Offline (${allKnown.filter((n) => !onlineSet.has(n)).length})` },
    { key: "all", label: `All (${allKnown.length})` },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-red-500" />
        <h1 className="text-xl font-bold">Players</h1>
        <Badge
          variant="outline"
          className={connected
            ? "border-green-600/40 text-green-400 bg-green-600/10"
            : "border-yellow-600/40 text-yellow-400 bg-yellow-600/10"}
        >
          <div className={`w-1 h-1 rounded-full mr-1 animate-pulse ${connected ? "bg-green-400" : "bg-yellow-400"}`} />
          {connected ? "Live" : "Connecting…"}
        </Badge>
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex rounded-md overflow-hidden border border-border">
          {filterLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search players…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      <Card className="border-red-600/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            {displayed.length} player{displayed.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {displayed.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {filter === "online" ? "No players currently online." : "No players found."}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <ul className="space-y-2">
                {displayed.map((name) => {
                  const isOnline = onlineSet.has(name);
                  return (
                    <li key={name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors group cursor-pointer" onClick={() => setSelectedPlayer(name)}>
                      <Avatar className="h-9 w-9 rounded-sm">
                        <AvatarImage
                          src={`https://mc-heads.net/avatar/${name}/36`}
                          alt={name}
                          className={`rounded-sm ${!isOnline ? "opacity-50 grayscale" : ""}`}
                        />
                        <AvatarFallback className={`text-xs font-semibold rounded-sm ${isOnline ? "bg-green-600/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${isOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                        <span className={`text-sm font-medium truncate ${!isOnline ? "text-muted-foreground" : ""}`}>{name}</span>
                        {!isOnline && <span className="text-[10px] text-muted-foreground/60 shrink-0">offline</span>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {isOnline && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-orange-400 hover:bg-orange-500/10"
                            title={`Kick ${name}`}
                            onClick={(e) => { e.stopPropagation(); setAction({ type: "kick", name }); setReason(""); }}
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:bg-red-500/10"
                          title={`Ban ${name}`}
                          onClick={(e) => { e.stopPropagation(); setAction({ type: "ban", name }); setReason(""); }}
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action?.type === "kick" ? "Kick" : "Ban"} {action?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action?.type === "kick"
                ? `${action.name} will be disconnected from the server.`
                : `${action?.name} will be permanently banned and cannot rejoin.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 grid gap-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input
              id="reason"
              placeholder="No reason provided"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={loading}
              className={action?.type === "ban" ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}
            >
              {loading ? "Processing…" : (action?.type === "kick" ? "Kick Player" : "Ban Player")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PlayerDetailsSheet
        serverId={id}
        playerName={selectedPlayer}
        open={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
      />
    </div>
  );
}

