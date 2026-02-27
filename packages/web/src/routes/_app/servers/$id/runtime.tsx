import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Server, RefreshCw, Download, Loader2, CheckCircle, AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";

export const Route = createFileRoute("/_app/servers/$id/runtime")({
  component: RuntimePage,
});

type RuntimeType = "vanilla" | "paper" | "purpur" | "fabric" | "forge";

interface CurrentRuntime {
  filename: string | null;
  runtime: string | null;
  version: string | null;
}

interface VersionsResponse {
  mcVersions?: string[];
  builds?: Array<{ id: string | number; stable: boolean; downloadUrl?: string; filename?: string }>;
  loaders?: string[];
  installers?: string[];
}

const RUNTIME_META: Record<RuntimeType, { label: string; color: string; description: string }> = {
  vanilla: { label: "Vanilla", color: "text-green-400",  description: "Official Mojang server" },
  paper:   { label: "Paper",   color: "text-blue-400",   description: "High-performance fork of Spigot" },
  purpur:  { label: "Purpur",  color: "text-purple-400", description: "Fork of Paper with extra features" },
  fabric:  { label: "Fabric",  color: "text-yellow-400", description: "Lightweight mod loader" },
  forge:   { label: "Forge",   color: "text-orange-400", description: "Minecraft Forge mod loader installer" },
};

function buildDownloadInfo(
  runtime: RuntimeType,
  mcVersion: string,
  buildId?: string | number,
  loaderVersion?: string,
  installerVersion?: string,
): { url: string; filename: string } | null {
  switch (runtime) {
    case "paper": {
      if (!buildId) return null;
      const b = String(buildId);
      return {
        url: `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${b}/downloads/paper-${mcVersion}-${b}.jar`,
        filename: `paper-${mcVersion}-${b}.jar`,
      };
    }
    case "purpur": {
      if (!buildId) return null;
      return {
        url: `https://api.purpurmc.org/v2/purpur/${mcVersion}/${buildId}/download`,
        filename: `purpur-${mcVersion}-${buildId}.jar`,
      };
    }
    case "fabric": {
      if (!loaderVersion || !installerVersion) return null;
      return {
        url: `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/${installerVersion}/server/jar`,
        filename: `fabric-server-mc.${mcVersion}-loader.${loaderVersion}-launcher.${installerVersion}.jar`,
      };
    }
    case "forge": {
      if (!buildId) return null;
      const forgeVersion = String(buildId);
      return {
        url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`,
        filename: `forge-${forgeVersion}-installer.jar`,
      };
    }
    case "vanilla":
      return null; // URL comes from API response (indirect)
  }
}

// ── Runtime Installer Tab ─────────────────────────────────────────────────

function RuntimeTab({ serverId, runtime }: { serverId: string; runtime: RuntimeType }) {
  const meta = RUNTIME_META[runtime];
  const [mcVersion, setMcVersion] = useState<string>("");
  const [buildId, setBuildId] = useState<string>("");
  const [loaderVersion, setLoaderVersion] = useState<string>("");
  const [installerVersion, setInstallerVersion] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [installed, setInstalled] = useState(false);

  const { data: mcVersionsData, isLoading: loadingMc } = useQuery<VersionsResponse>({
    queryKey: ["runtime-versions", serverId, runtime],
    queryFn: () =>
      fetch(`/api/servers/${serverId}/runtime/versions?runtime=${runtime}`, { credentials: "include" })
        .then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const { data: buildsData, isLoading: loadingBuilds } = useQuery<VersionsResponse>({
    queryKey: ["runtime-builds", serverId, runtime, mcVersion],
    queryFn: () =>
      fetch(`/api/servers/${serverId}/runtime/versions?runtime=${runtime}&mcVersion=${encodeURIComponent(mcVersion)}`, { credentials: "include" })
        .then((r) => r.json()),
    enabled: !!mcVersion,
    staleTime: 2 * 60_000,
  });

  const installMut = useMutation({
    mutationFn: (body: { url: string; filename: string; runtime: string; mcVersion: string }) =>
      fetch(`/api/servers/${serverId}/runtime/install`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => { setInstalled(true); setConfirmOpen(false); },
  });

  function getDownloadInfo() {
    if (runtime === "vanilla") {
      // For vanilla the URL is embedded in the builds response
      const b = buildsData?.builds?.find((b) => b.id === mcVersion);
      if (!b?.downloadUrl || !b?.filename) return null;
      return { url: b.downloadUrl, filename: b.filename };
    }
    return buildDownloadInfo(runtime, mcVersion, buildId || undefined, loaderVersion || undefined, installerVersion || undefined);
  }

  const dlInfo = getDownloadInfo();
  const canInstall = !!dlInfo;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{meta.description}</p>

      {/* MC Version */}
      <div className="space-y-1.5">
        <Label className="text-xs">Minecraft version</Label>
        {loadingMc ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <Select value={mcVersion} onValueChange={(v) => { setMcVersion(v); setBuildId(""); setLoaderVersion(""); setInstallerVersion(""); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select MC version…" />
            </SelectTrigger>
            <SelectContent>
              <ScrollArea className="h-48">
                {(mcVersionsData?.mcVersions ?? []).map((v) => (
                  <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                ))}
              </ScrollArea>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Fabric: loader + installer pickers */}
      {runtime === "fabric" && mcVersion && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Loader version</Label>
            {loadingBuilds ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <Select value={loaderVersion} onValueChange={setLoaderVersion}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select loader…" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-36">
                    {(buildsData?.loaders ?? []).map((v) => (
                      <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Installer version</Label>
            {loadingBuilds ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <Select value={installerVersion} onValueChange={setInstallerVersion}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select installer…" />
                </SelectTrigger>
                <SelectContent>
                  {(buildsData?.installers ?? []).map((v) => (
                    <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </>
      )}

      {/* Paper / Purpur / Forge / Vanilla: build picker */}
      {runtime !== "fabric" && mcVersion && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            {runtime === "forge" ? "Forge version" : runtime === "vanilla" ? "Release" : "Build"}
          </Label>
          {loadingBuilds ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select value={buildId} onValueChange={setBuildId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={runtime === "vanilla" ? mcVersion : "Select build…"} />
              </SelectTrigger>
              {runtime !== "vanilla" && (
                <SelectContent>
                  <ScrollArea className="h-48">
                    {(buildsData?.builds ?? []).map((b) => (
                      <SelectItem key={String(b.id)} value={String(b.id)} className="text-xs">
                        {String(b.id)}{b.stable ? " ★" : ""}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              )}
            </Select>
          )}
        </div>
      )}

      {/* Filename preview */}
      {dlInfo && (
        <div className="p-2.5 rounded-md bg-muted/30 border text-xs font-mono text-muted-foreground break-all">
          {dlInfo.filename}
        </div>
      )}

      {runtime === "forge" && (
        <p className="text-[11px] text-amber-400/80 flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Forge downloads an installer JAR — you'll need to run it manually on the server after download.
        </p>
      )}

      {installed && (
        <div className="flex items-center gap-2 text-green-400 text-xs">
          <CheckCircle className="w-4 h-4" />
          JAR downloaded successfully. Restart the server to apply.
        </div>
      )}

      <Button
        className="w-full h-8 text-xs"
        disabled={!canInstall || installMut.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {installMut.isPending
          ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Downloading…</>
          : <><Download className="w-3.5 h-3.5 mr-1.5" /> Download & Install</>
        }
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Install {meta.label} {mcVersion}?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-xs break-all">{dlInfo?.filename}</span> will be downloaded into the server directory.
              The server must be restarted to use the new JAR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dlInfo && installMut.mutate({ ...dlInfo, runtime, mcVersion })}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Install
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

function RuntimePage() {
  const { id } = Route.useParams();
  const [activeTab, setActiveTab] = useState<RuntimeType>("paper");

  const { data: current, isLoading, refetch } = useQuery<CurrentRuntime>({
    queryKey: ["runtime-current", id],
    queryFn: () => fetch(`/api/servers/${id}/runtime/current`, { credentials: "include" }).then((r) => r.json()),
  });

  return (
    <div className="p-4 space-y-4">
      {/* Current runtime card */}
      <Card className="p-3 bg-gradient-to-br from-blue-950/50 to-blue-900/30 border-blue-600/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-md border border-blue-600/30">
              <Server className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current server JAR</p>
              {isLoading ? (
                <Skeleton className="h-5 w-48 mt-0.5" />
              ) : current?.filename ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold font-mono">{current.filename}</p>
                  {current.runtime && current.runtime !== "unknown" && (
                    <Badge variant="outline" className={`text-[10px] h-4 border-current ${RUNTIME_META[current.runtime as RuntimeType]?.color ?? "text-muted-foreground"}`}>
                      {RUNTIME_META[current.runtime as RuntimeType]?.label ?? current.runtime}
                    </Badge>
                  )}
                  {current.version && (
                    <Badge variant="secondary" className="text-[10px] h-4">{current.version}</Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No server JAR detected</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => void refetch()}>
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </Card>

      {/* Runtime installer */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Install Server Runtime</h3>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RuntimeType)}>
          <TabsList className="grid grid-cols-5 h-8 mb-4">
            {(Object.keys(RUNTIME_META) as RuntimeType[]).map((r) => (
              <TabsTrigger key={r} value={r} className="text-xs h-7">
                {RUNTIME_META[r].label}
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(RUNTIME_META) as RuntimeType[]).map((r) => (
            <TabsContent key={r} value={r}>
              <RuntimeTab serverId={id} runtime={r} />
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-4 pt-4 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 shrink-0" />
            After installing, restart the server via the Console tab to load the new runtime.
          </p>
        </div>
      </Card>
    </div>
  );
}
