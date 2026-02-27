import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import React from "react";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  ArrowLeft, UserX, Shield, ShieldOff, Crown, CrownIcon,
  Heart, Utensils, Star, Skull, Clock, Footprints, Pickaxe, Hammer,
  MapPin, Activity, ChevronRight, RefreshCw, Sword,
} from "lucide-react";

export const Route = createFileRoute("/_app/servers/$id/players/$name")({
  component: PlayerDetailPage,
});

// ── Types ────────────────────────────────────────────────────────────────────
type ActionType = "kick" | "ban" | "unban" | "op" | "deop";

interface PlayerDetails {
  name: string;
  uuid: string | null;
  online: boolean;
  lastSeen: string | null;
  lastLoginPos: [number, number, number] | null;
  banned: boolean;
  isOp: boolean;
  stats: {
    deaths: number; mobKills: number; playerKills: number; playTimeTicks: number;
    jumpCount: number; damageTaken: number; damageDealt: number;
    walkCm: number; sprintCm: number; flyCm: number;
    blocksMined: number; itemsCrafted: number;
    topMinedBlocks: [string, number][];
    killedBy: [string, number][];
  } | null;
  advancements: { completed: number } | null;
  liveData: LiveInnerData | null;
  recentActivity: string[];
}

interface LiveInnerData {
  health: number | null; maxHealth: number; food: number | null; saturation: number | null;
  xpLevel: number | null; xpProgress: number | null;
  pos: [number, number, number] | null; dimension: string | null;
}

interface LiveData {
  online: boolean;
  liveData: LiveInnerData | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
function dimLabel(dim: string | null) {
  if (dim === "minecraft:overworld") return "Overworld";
  if (dim === "minecraft:the_nether") return "Nether";
  if (dim === "minecraft:the_end") return "The End";
  return dim ?? "Unknown";
}

// ── Player Detail Page ────────────────────────────────────────────────────────
function PlayerDetailPage() {
  const { id, name } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [action, setAction] = useState<{ type: ActionType; label: string; desc: string; cls: string } | null>(null);
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Slow query: stats, UUID, advancements, activity (30s)
  const { data, isLoading, refetch } = useQuery<PlayerDetails>({
    queryKey: ["player-details", id, name],
    queryFn: () =>
      fetch(`/api/servers/${id}/players/${encodeURIComponent(name)}/details`, { credentials: "include" })
        .then((r) => r.json()),
    refetchInterval: 30_000,
  });

  // Fast query: live RCON data (health, food, XP, pos) refreshed every 3s
  const { data: liveResp } = useQuery<LiveData>({
    queryKey: ["player-live", id, name],
    queryFn: () =>
      fetch(`/api/servers/${id}/players/${encodeURIComponent(name)}/live`, { credentials: "include" })
        .then((r) => r.json()),
    refetchInterval: 3_000,
    staleTime: 0,
  });

  const isOnline = liveResp?.online ?? data?.online ?? false;
  const liveData: LiveInnerData | null = liveResp?.liveData ?? data?.liveData ?? null;

  async function doAction() {
    if (!action) return;
    setActionLoading(true);
    try {
      await fetch(`/api/servers/${id}/players/${encodeURIComponent(name)}/${action.type}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      void refetch();
      void qc.invalidateQueries({ queryKey: ["players-history", id] });
    } finally {
      setActionLoading(false);
      setAction(null);
      setReason("");
    }
  }

  const actions = data ? [
    isOnline && { type: "kick" as ActionType, label: "Kick", desc: `${name} will be disconnected.`, cls: "border-orange-500/30 text-orange-400 hover:bg-orange-500/10", icon: UserX },
    !data.banned
      ? { type: "ban" as ActionType, label: "Ban", desc: `${name} will be permanently banned.`, cls: "border-red-500/30 text-red-400 hover:bg-red-500/10", icon: Shield }
      : { type: "unban" as ActionType, label: "Unban", desc: `Remove ${name}'s ban.`, cls: "border-green-500/30 text-green-400 hover:bg-green-500/10", icon: ShieldOff },
    !data.isOp
      ? { type: "op" as ActionType, label: "Give OP", desc: `Grant ${name} operator permissions.`, cls: "border-purple-500/30 text-purple-400 hover:bg-purple-500/10", icon: Crown }
      : { type: "deop" as ActionType, label: "Remove OP", desc: `Remove ${name}'s operator permissions.`, cls: "border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10", icon: CrownIcon },
  ].filter(Boolean) as { type: ActionType; label: string; desc: string; cls: string; icon: React.ComponentType<{ className?: string }> }[] : [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Top bar */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3 sticky top-0 bg-background z-10">
        <Button
          variant="ghost" size="sm"
          onClick={() => void navigate({ to: `/servers/${id}/players` as "/" })}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Players
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-semibold">{name}</span>
        {data && (
          <div className="flex items-center gap-2 ml-1">
            <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
            <span className="text-xs text-muted-foreground">{isOnline ? "Online" : "Offline"}</span>
            {data.isOp && <Badge variant="outline" className="text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0">OP</Badge>}
            {data.banned && <Badge variant="outline" className="text-red-400 border-red-500/30 text-[10px] px-1.5 py-0">Banned</Badge>}
          </div>
        )}
        <div className="ml-auto">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-4xl mx-auto w-full space-y-6">
        {isLoading ? (
          <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        ) : !data ? (
          <div className="text-center py-16 text-muted-foreground">Failed to load player data.</div>
        ) : (
          <>
            {/* Hero */}
            <div className="flex gap-6 items-start">
              <div className="shrink-0 flex flex-col items-center gap-2">
                <div className="w-24 h-48 bg-muted/30 rounded-xl overflow-hidden border border-border flex items-end justify-center">
                  <img
                    src={`https://mc-heads.net/body/${name}/200`}
                    alt={`${name} body`}
                    className={`h-full object-contain ${!isOnline ? "opacity-70 grayscale" : ""}`}
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.src = `https://mc-heads.net/avatar/${name}/96`;
                      el.className = "w-24 h-24 object-contain rounded-lg m-auto opacity-70";
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">{name}</h2>
                  {data.uuid && <p className="text-xs text-muted-foreground font-mono mt-0.5">{data.uuid}</p>}
                  {data.advancements && <p className="text-xs text-muted-foreground mt-1">{data.advancements.completed} advancements completed</p>}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <Button key={a.type} variant="outline" size="sm"
                      className={`gap-1.5 ${a.cls}`}
                      onClick={() => { setAction(a); setReason(""); }}>
                      <a.icon className="w-3.5 h-3.5" />
                      {a.label}
                    </Button>
                  ))}
                </div>

                {/* Live section — updates every 3s */}
                {isOnline && (
                  <Card className="border-green-600/20 bg-green-950/10">
                    <CardContent className="pt-3 pb-3 px-4 space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-green-400 flex items-center gap-1.5 mb-3">
                        <Activity className="w-3 h-3 animate-pulse" /> Live
                      </p>
                      {liveData?.health !== null && liveData?.health !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground"><Heart className="w-3 h-3 text-red-400" /> Health</span>
                            <span>{liveData.health.toFixed(1)} / {liveData.maxHealth}</span>
                          </div>
                          <Progress value={(liveData.health / liveData.maxHealth) * 100} className="h-1.5 [&>div]:bg-red-500" />
                        </div>
                      )}
                      {liveData?.food !== null && liveData?.food !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground"><Utensils className="w-3 h-3 text-orange-400" /> Food</span>
                            <span>{liveData.food} / 20</span>
                          </div>
                          <Progress value={(liveData.food / 20) * 100} className="h-1.5 [&>div]:bg-orange-500" />
                        </div>
                      )}
                      {liveData?.xpLevel !== null && liveData?.xpLevel !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground"><Star className="w-3 h-3 text-yellow-400" /> XP</span>
                            <span>Level {liveData.xpLevel}</span>
                          </div>
                          <Progress value={(liveData.xpProgress ?? 0) * 100} className="h-1.5 [&>div]:bg-yellow-400" />
                        </div>
                      )}
                      {liveData?.pos && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                          <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
                          {liveData.pos.map((v) => Math.floor(v)).join(", ")}
                          {liveData.dimension && <span className="text-blue-400/70">({dimLabel(liveData.dimension)})</span>}
                        </p>
                      )}
                      {!liveData || (liveData.health === null && liveData.food === null && liveData.xpLevel === null && !liveData.pos) && (
                        <p className="text-xs text-muted-foreground">Live stats unavailable (requires <span className="font-mono">data get entity</span> RCON access)</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {!isOnline && data.lastLoginPos && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-400/60 shrink-0" />
                    Last seen at {data.lastLoginPos.map((v) => Math.floor(v)).join(", ")}
                  </p>
                )}
              </div>
            </div>

            {/* Stats grid */}
            {data.stats && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Statistics</h3>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {[
                    { icon: Skull,     label: "Deaths",   value: data.stats.deaths,                                             color: "text-red-400" },
                    { icon: Sword,     label: "Mob Kills", value: data.stats.mobKills,                                          color: "text-orange-400" },
                    { icon: Clock,     label: "Playtime",  value: fmt(data.stats.playTimeTicks),                                color: "text-blue-400" },
                    { icon: Footprints,label: "Distance",  value: fmtDist(data.stats.walkCm + data.stats.sprintCm),             color: "text-green-400" },
                    { icon: Pickaxe,   label: "Mined",     value: data.stats.blocksMined.toLocaleString(),                     color: "text-yellow-400" },
                    { icon: Hammer,    label: "Crafted",   value: data.stats.itemsCrafted.toLocaleString(),                    color: "text-purple-400" },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <Card key={label} className="border-border/50">
                      <CardContent className="pt-3 pb-3 px-3 flex flex-col items-center gap-1">
                        <Icon className={`w-4 h-4 ${color}`} />
                        <p className="text-base font-bold leading-none">{value}</p>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {(data.stats.damageTaken > 0 || data.stats.damageDealt > 0) && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="bg-muted/20 rounded-lg px-4 py-2 text-xs">
                      <span className="text-muted-foreground">Damage taken</span>
                      <span className="float-right font-semibold text-red-400">{(data.stats.damageTaken / 2).toFixed(1)} ❤</span>
                    </div>
                    <div className="bg-muted/20 rounded-lg px-4 py-2 text-xs">
                      <span className="text-muted-foreground">Damage dealt</span>
                      <span className="float-right font-semibold text-orange-400">{(data.stats.damageDealt / 2).toFixed(1)} ❤</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Top mined + Killed by */}
            <div className="grid grid-cols-2 gap-4">
              {(data.stats?.topMinedBlocks?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Pickaxe className="w-3 h-3" /> Top Mined</h3>
                  <div className="space-y-1.5">
                    {data.stats!.topMinedBlocks.map(([block, count]) => (
                      <div key={block} className="flex justify-between items-center text-xs bg-muted/20 rounded px-3 py-1.5">
                        <span className="text-muted-foreground">{fmtMob(block)}</span>
                        <span className="font-semibold">{count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(data.stats?.killedBy?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Skull className="w-3 h-3 text-red-400" /> Killed By</h3>
                  <div className="space-y-1.5">
                    {data.stats!.killedBy.map(([mob, count]) => (
                      <div key={mob} className="flex justify-between items-center text-xs bg-muted/20 rounded px-3 py-1.5">
                        <span className="text-muted-foreground">{fmtMob(mob)}</span>
                        <span className="font-semibold">{count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent activity */}
            {data.recentActivity.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent Activity</h3>
                <div className="bg-muted/10 border border-border/50 rounded-xl overflow-hidden">
                  {data.recentActivity.map((line, i) => (
                    <div key={i} className={`flex items-start gap-2 px-4 py-2 text-[11px] font-mono ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/50" />
                      <span className="text-muted-foreground truncate">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action confirm dialog */}
      <AlertDialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action?.label} {name}?</AlertDialogTitle>
            <AlertDialogDescription>{action?.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          {(action?.type === "kick" || action?.type === "ban") && (
            <div className="py-2 grid gap-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input id="reason" placeholder="No reason provided" value={reason} onChange={(e) => setReason(e.target.value)} className="bg-black/30" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doAction} disabled={actionLoading}
              className={action?.type === "ban" ? "bg-red-600 hover:bg-red-700" : action?.type === "op" ? "bg-purple-600 hover:bg-purple-700" : ""}>
              {actionLoading ? "Processing…" : action?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
