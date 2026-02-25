import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Package, RefreshCw, Search, HardDrive, Puzzle } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

export const Route = createFileRoute("/_app/servers/$id/plugins")({
  component: PluginsPage,
});

interface PluginItem {
  filename: string;
  name: string;
  version: string;
  size: number;
  modifiedAt: string;
}

interface PluginsResponse {
  type: "plugins" | "mods" | "none";
  items: PluginItem[];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PluginsPage() {
  const { id } = Route.useParams();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<PluginsResponse>({
    queryKey: ["plugins", id],
    queryFn: () => fetch(`/api/servers/${id}/plugins`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const type = data?.type ?? "plugins";
  const label = type === "mods" ? "Mods" : "Plugins";
  const Icon = type === "mods" ? Puzzle : Package;

  const items = (data?.items ?? []).filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.version.includes(search)
  );

  return (
    <div className="p-4 space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 bg-gradient-to-br from-red-950/50 to-red-900/30 border-red-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-red-500/20 rounded-md border border-red-600/30">
              <Icon className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Installed {label}</p>
              {isLoading ? (
                <Skeleton className="h-5 w-8 mt-0.5" />
              ) : (
                <p className="text-base font-semibold">{data?.items.length ?? 0}</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-gray-950/50 to-gray-900/30 border-gray-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gray-500/20 rounded-md border border-gray-600/30">
              <HardDrive className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total size</p>
              {isLoading ? (
                <Skeleton className="h-5 w-14 mt-0.5" />
              ) : (
                <p className="text-base font-semibold">
                  {formatBytes((data?.items ?? []).reduce((acc, p) => acc + p.size, 0))}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Installed {label}</h3>
            {!isLoading && (
              <Badge variant="secondary" className="text-[10px] h-4">{data?.items.length ?? 0}</Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-red-600/20 hover:border-red-600/40"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3 h-3 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder={`Search ${label.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-muted/30"
          />
        </div>

        {type === "none" && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No plugins/ or mods/ directory found.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Check that the server volume is mounted correctly.</p>
          </div>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="space-y-1.5">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                      <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))
                : items.length === 0
                  ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Search className="w-8 h-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No results for "{search}"</p>
                    </div>
                  )
                  : items.map((item) => (
                      <div
                        key={item.filename}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="p-2 rounded-md bg-red-500/10 border border-red-600/20 shrink-0">
                          <Icon className="w-4 h-4 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{item.name}</p>
                            {item.version && (
                              <span className="text-[10px] text-muted-foreground font-mono">v{item.version}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate font-mono">{item.filename}</p>
                        </div>
                        <div className="text-right shrink-0 hidden sm:block">
                          <p className="text-[11px] text-muted-foreground">{formatBytes(item.size)}</p>
                          <p className="text-[10px] text-muted-foreground/60">
                            {new Date(item.modifiedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}

