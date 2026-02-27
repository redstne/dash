import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Zap, Users, Copy, Check, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/status/$id")({
  component: StatusPage,
});

interface PublicStatus {
  name: string;
  host: string;
  online: boolean;
  players: string[];
  playerCount: number;
  maxPlayers: number;
  tps: number | null;
  error?: string;
}

function StatusPage() {
  const { id } = Route.useParams();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<PublicStatus>({
    queryKey: ["public-status", id],
    queryFn: async () => {
      const res = await fetch(`/api/public/${id}/status`);
      setLastUpdated(new Date());
      return res.json() as Promise<PublicStatus>;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (data?.name) document.title = `${data.name} — Server Status`;
  }, [data?.name]);

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isOnline = data?.online ?? false;
  const tpsOk = (data?.tps ?? 20) >= 18;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand */}
        <div className="flex items-center gap-2 justify-center mb-2">
          <Zap className="w-4 h-4 text-red-500 fill-red-500" />
          <span className="text-xs text-muted-foreground">redstne.dash</span>
        </div>

        {/* Main card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 space-y-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data?.error ? (
            <p className="text-center text-muted-foreground">Server not found.</p>
          ) : (
            <>
              {/* Server name */}
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-bold">{data?.name}</h1>
                <p className="text-sm text-muted-foreground font-mono">{data?.host}</p>
                {/* Status badge */}
                <div className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full font-bold text-sm ${
                  isOnline
                    ? "bg-green-600/20 border border-green-600/40 text-green-400"
                    : "bg-red-800/20 border border-red-600/30 text-red-400"
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                  {isOnline ? "ONLINE" : "OFFLINE"}
                  {isOnline && (
                    <span className="font-normal text-white/60">
                      · {data?.playerCount}/{data?.maxPlayers} players
                    </span>
                  )}
                </div>
              </div>

              {/* Stats row */}
              {isOnline && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                    <p className="text-2xl font-bold">{data?.playerCount}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">/ {data?.maxPlayers} players</p>
                  </div>
                  <div className={`rounded-xl bg-white/5 border border-white/10 p-3 text-center ${
                    data?.tps !== null && !tpsOk ? "border-red-600/30" : ""
                  }`}>
                    <p className={`text-2xl font-bold ${data?.tps !== null ? (tpsOk ? "text-green-400" : "text-red-400") : "text-muted-foreground"}`}>
                      {data?.tps !== null ? data!.tps!.toFixed(1) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">TPS</p>
                  </div>
                </div>
              )}

              {/* Player list */}
              {isOnline && (data?.players?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> Online Players
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {data!.players.map((name) => (
                      <div key={name} className="flex flex-col items-center gap-1">
                        <img
                          src={`https://mc-heads.net/avatar/${name}/48`}
                          alt={name}
                          className="w-12 h-12 rounded-lg bg-white/10"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <span className="text-[10px] text-muted-foreground truncate w-full text-center">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Updated {lastUpdated.toLocaleTimeString()}</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={copyLink}
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
