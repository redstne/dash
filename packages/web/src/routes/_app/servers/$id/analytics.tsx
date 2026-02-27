import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Users, Zap, Activity, ArrowRightLeft, MessageSquare, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Progress } from "@/components/ui/progress.tsx";

export const Route = createFileRoute("/_app/servers/$id/analytics")({
  component: AnalyticsPage,
});

interface Sample {
  at: number;
  tps: number | null;
  count?: number;
}

function TpsBar({ value }: { value: number | null }) {
  const v = value ?? 0;
  const pct = Math.min(100, (v / 20) * 100);
  const color =
    v >= 19 ? "from-green-600 to-green-400"
    : v >= 16 ? "from-orange-600 to-orange-400"
    : "from-red-600 to-red-400";
  return (
    <div
      className={`w-full rounded-t-sm bg-gradient-to-t ${color} min-h-[2px] transition-all`}
      style={{ height: `${pct}%` }}
    />
  );
}

function PlayerBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="w-full rounded-t-sm bg-gradient-to-t from-blue-600 to-blue-400 min-h-[2px] transition-all"
      style={{ height: `${pct}%` }}
    />
  );
}

function shortTime(at: number): string {
  const d = new Date(at);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function AnalyticsPage() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", id],
    queryFn: async () => {
      const res = await fetch(`/api/servers/${id}/analytics`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{
        tpsHistory: { at: number; tps: number | null }[];
        playerHistory: { at: number; count: number }[];
        joinsToday: number;
        leavesToday: number;
        chatToday: number;
      }>;
    },
    refetchInterval: 60_000,
  });

  const { data: resources } = useQuery({
    queryKey: ["resources", id],
    queryFn: () => fetch(`/api/servers/${id}/resources`, { credentials: "include" }).then((r) => r.json()) as Promise<{
      available: boolean;
      cpu: number | null;
      ramUsed: number | null;
      ramTotal: number | null;
      diskUsed: number | null;
      diskTotal: number | null;
    }>,
    refetchInterval: 10_000,
  });

  // Downsample to at most 40 bars for readability
  function downsample<T>(arr: T[], max: number): T[] {
    if (arr.length <= max) return arr;
    const step = Math.ceil(arr.length / max);
    return arr.filter((_, i) => i % step === 0);
  }

  const tpsSamples = downsample(data?.tpsHistory ?? [], 40);
  const playerSamples = downsample(data?.playerHistory ?? [], 40);

  const peakPlayers = Math.max(0, ...(data?.playerHistory ?? []).map((s) => s.count));
  const validTps = (data?.tpsHistory ?? []).map((s) => s.tps).filter((t): t is number => t !== null);
  const avgTps = validTps.length ? validTps.reduce((a, b) => a + b, 0) / validTps.length : null;
  const maxPlayers = Math.max(1, peakPlayers);

  return (
    <div className="p-4 space-y-4">
      {/* Resource Usage */}
      {resources?.available && (
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Resource Usage</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {resources.cpu !== null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Cpu className="w-3.5 h-3.5" /> CPU</div>
                  <span className="text-xs font-medium">{resources.cpu.toFixed(1)}%</span>
                </div>
                <Progress value={resources.cpu} className="h-2" />
              </div>
            )}
            {resources.ramUsed !== null && resources.ramTotal !== null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MemoryStick className="w-3.5 h-3.5" /> RAM</div>
                  <span className="text-xs font-medium">{(resources.ramUsed / 1024 / 1024).toFixed(0)} / {(resources.ramTotal / 1024 / 1024).toFixed(0)} MB</span>
                </div>
                <Progress value={(resources.ramUsed / resources.ramTotal) * 100} className="h-2" />
              </div>
            )}
            {resources.diskUsed !== null && resources.diskTotal !== null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><HardDrive className="w-3.5 h-3.5" /> Disk</div>
                  <span className="text-xs font-medium">{(resources.diskUsed / 1024 / 1024 / 1024).toFixed(1)} / {(resources.diskTotal / 1024 / 1024 / 1024).toFixed(1)} GB</span>
                </div>
                <Progress value={(resources.diskUsed / resources.diskTotal) * 100} className="h-2" />
              </div>
            )}
          </div>
        </Card>
      )}
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 bg-gradient-to-br from-blue-950/50 to-blue-900/30 border-blue-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded-md border border-blue-600/30">
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Peak Players</p>
              {isLoading ? <Skeleton className="h-4 w-8 mt-0.5" /> : (
                <p className="text-base font-semibold text-blue-400">{peakPlayers}</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-green-950/50 to-green-900/30 border-green-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-md border border-green-600/30">
              <ArrowRightLeft className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Joins today</p>
              {isLoading ? <Skeleton className="h-4 w-8 mt-0.5" /> : (
                <p className="text-base font-semibold text-green-400">{data?.joinsToday ?? 0}</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-orange-950/50 to-orange-900/30 border-orange-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-orange-500/20 rounded-md border border-orange-600/30">
              <Zap className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg TPS</p>
              {isLoading ? <Skeleton className="h-4 w-8 mt-0.5" /> : (
                <p className="text-base font-semibold text-orange-400">
                  {avgTps !== null ? avgTps.toFixed(1) : "—"}
                </p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-purple-950/50 to-purple-900/30 border-purple-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-500/20 rounded-md border border-purple-600/30">
              <MessageSquare className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Chat today</p>
              {isLoading ? <Skeleton className="h-4 w-8 mt-0.5" /> : (
                <p className="text-base font-semibold text-purple-400">{data?.chatToday ?? 0}</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* TPS chart */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold">TPS History</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {tpsSamples.length} samples · max 20
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : tpsSamples.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
            No TPS data yet — data accumulates as the server runs
          </div>
        ) : (
          <div className="flex items-end gap-px h-24">
            {tpsSamples.map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                  {s.tps?.toFixed(1) ?? "—"} · {shortTime(s.at)}
                </div>
                <TpsBar value={s.tps} />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between mt-1">
          {tpsSamples.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">{shortTime(tpsSamples[0]!.at)}</span>
              <span className="text-[10px] text-muted-foreground">{shortTime(tpsSamples[tpsSamples.length - 1]!.at)}</span>
            </>
          )}
        </div>
      </Card>

      {/* Player count chart */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold">Player Count History</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {playerSamples.length} samples
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : playerSamples.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
            No player history yet
          </div>
        ) : (
          <div className="flex items-end gap-px h-24">
            {playerSamples.map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                  {s.count} · {shortTime(s.at)}
                </div>
                <PlayerBar value={s.count} max={maxPlayers} />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between mt-1">
          {playerSamples.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">{shortTime(playerSamples[0]!.at)}</span>
              <span className="text-[10px] text-muted-foreground">{shortTime(playerSamples[playerSamples.length - 1]!.at)}</span>
            </>
          )}
        </div>
      </Card>

      {/* Activity summary */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Activity Summary (today)</h3>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <div className="space-y-0">
            {[
              { label: "Player joins", value: data?.joinsToday ?? 0, color: "text-blue-400" },
              { label: "Player leaves", value: data?.leavesToday ?? 0, color: "text-orange-400" },
              { label: "Chat messages", value: data?.chatToday ?? 0, color: "text-purple-400" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className={`text-sm font-semibold ${row.color}`}>{row.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
