import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, Shield, Zap, Clock, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

export const Route = createFileRoute("/_app/servers/$id/alerts")({
  component: AlertsPage,
});

type Severity = "critical" | "warning" | "info";

interface Alert {
  id: string;
  severity: Severity;
  message: string;
  detail: string;
  at: string;
  source: string;
}

const SEV = {
  critical: {
    color: "text-red-400",
    bg: "bg-red-950/40 border-red-600/30",
    icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
    badge: "bg-red-600/20 text-red-400 border-red-600/30",
  },
  warning: {
    color: "text-orange-400",
    bg: "bg-orange-950/40 border-orange-600/30",
    icon: <Zap className="w-4 h-4 text-orange-400" />,
    badge: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  },
  info: {
    color: "text-blue-400",
    bg: "bg-blue-950/40 border-blue-600/30",
    icon: <Bell className="w-4 h-4 text-blue-400" />,
    badge: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function AlertsPage() {
  const { id } = Route.useParams();

  const { data, isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["alerts", id],
    queryFn: async () => {
      const res = await fetch(`/api/servers/${id}/alerts`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ alerts: Alert[] }>;
    },
    refetchInterval: 30_000,
  });

  const alerts = data?.alerts ?? [];
  const active = alerts.filter((a) => a.severity !== "info" || a.source === "status");
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const infoCount = alerts.filter((a) => a.severity === "info").length;

  return (
    <div className="p-4 space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-gradient-to-br from-red-950/50 to-red-900/30 border-red-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-red-500/20 rounded-md border border-red-600/30">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Critical</p>
              {isLoading ? (
                <Skeleton className="h-4 w-6 mt-0.5" />
              ) : (
                <p className="text-base font-semibold text-red-400">{criticalCount}</p>
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
              <p className="text-xs text-muted-foreground">Warnings</p>
              {isLoading ? (
                <Skeleton className="h-4 w-6 mt-0.5" />
              ) : (
                <p className="text-base font-semibold text-orange-400">{warningCount}</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-blue-950/50 to-blue-900/30 border-blue-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded-md border border-blue-600/30">
              <Shield className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Info</p>
              {isLoading ? (
                <Skeleton className="h-4 w-6 mt-0.5" />
              ) : (
                <p className="text-base font-semibold text-blue-400">{infoCount}</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Alert Feed</h3>
          {active.length > 0 && (
            <Badge className="text-[10px] h-4 px-1.5 bg-red-600/20 text-red-400 border-red-600/30 animate-pulse">
              {active.length} active
            </Badge>
          )}
          <button
            onClick={() => refetch()}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {dataUpdatedAt > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {relativeTime(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Shield className="w-8 h-8 opacity-40" />
            <p className="text-sm">No alerts detected</p>
            <p className="text-xs opacity-60">The server log is clean</p>
          </div>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="space-y-2">
              {alerts.map((alert) => {
                const s = SEV[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${s.bg}`}
                  >
                    <div className="mt-0.5">{s.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${s.color}`}>{alert.message}</p>
                        <Badge className={`text-[10px] h-4 px-1.5 ${s.badge}`}>{alert.severity}</Badge>
                        {alert.source === "status" && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">live</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{alert.detail}</p>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" />
                      {relativeTime(alert.at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}
