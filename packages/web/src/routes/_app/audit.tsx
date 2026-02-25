import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

interface AuditEntry {
  id: number;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  ip: string | null;
  createdAt: number;
}

function AuditPage() {
  const { data: logs = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ["audit"],
    queryFn: async () => {
      const res = await fetch("/api/audit", { credentials: "include" });
      return res.json() as Promise<AuditEntry[]>;
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-red-500" />
        <h1 className="text-2xl font-bold">Audit Log</h1>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-red-600/20 bg-card p-12 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No audit events yet.</p>
        </div>
      ) : (
        <Card className="border-red-600/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{logs.length} events</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[calc(100vh-200px)]">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-red-600/20 bg-red-600/5 sticky top-0">
                    <tr className="text-xs uppercase">
                      <th className="px-4 py-3 text-left font-medium text-red-400/80">Time</th>
                      <th className="px-4 py-3 text-left font-medium text-red-400/80">Action</th>
                      <th className="px-4 py-3 text-left font-medium text-red-400/80">Resource</th>
                      <th className="px-4 py-3 text-left font-medium text-red-400/80">User</th>
                      <th className="px-4 py-3 text-left font-medium text-red-400/80">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...logs].reverse().map((log, i) => (
                      <tr
                        key={log.id}
                        className={`border-b border-border/30 hover:bg-accent/30 transition-colors ${i % 2 === 0 ? "bg-transparent" : "bg-card/50"}`}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {new Date((log.createdAt ?? 0) * 1000).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-foreground">{log.action}</td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className="text-foreground">{log.resource}</span>
                          {log.resourceId && (
                            <span className="text-muted-foreground ml-1 font-mono">#{log.resourceId.slice(0, 8)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                          {log.userId?.slice(0, 8) ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.ip ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
