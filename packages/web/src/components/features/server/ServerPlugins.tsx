
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Package, RefreshCw, Search, HardDrive, Puzzle, Power, PowerOff, Trash2,
  Plus, Download, ExternalLink, Loader2, X, AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Label } from "@/components/ui/label.tsx";


interface ModItem {
  filename: string;
  name: string;
  version: string | null;
  slug: string | null;
  source: "modrinth" | "url" | "filesystem";
  downloadUrl: string | null;
  enabled: boolean;
  size: number;
  modifiedAt: string;
}

interface ModsResponse {
  type: "plugins" | "mods" | "none";
  items: ModItem[];
}

interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  downloads: number;
  icon_url: string | null;
  latest_version: string;
}

interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: Array<{ url: string; filename: string; primary: boolean }>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Modrinth Search Dialog ─────────────────────────────────────────────────

function ModrinthDialog({ serverId, modType, onClose, onInstalled }: {
  serverId: string;
  modType: "plugins" | "mods";
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [search, setSearch] = useState("");
  const [mcVersion, setMcVersion] = useState("");
  const [selectedProject, setSelectedProject] = useState<ModrinthHit | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ModrinthVersion | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const loader = modType === "plugins" ? "bukkit" : undefined;

  const { data: results, isFetching: searching } = useQuery<{ hits: ModrinthHit[] }>({
    queryKey: ["modrinth-search", serverId, search, loader, mcVersion],
    queryFn: () => {
      const qs = new URLSearchParams({ q: search });
      if (loader) qs.set("loader", loader);
      if (mcVersion) qs.set("mcVersion", mcVersion);
      return fetch(`/api/servers/${serverId}/mods/search?${qs}`, { credentials: "include" }).then((r) => r.json());
    },
    enabled: search.length > 1,
    staleTime: 10_000,
  });

  const { data: versions, isLoading: loadingVersions } = useQuery<ModrinthVersion[]>({
    queryKey: ["modrinth-versions", serverId, selectedProject?.project_id, loader, mcVersion],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (loader) qs.set("loader", loader);
      if (mcVersion) qs.set("mcVersion", mcVersion);
      return fetch(
        `/api/servers/${serverId}/mods/modrinth/${selectedProject!.project_id}/versions?${qs}`,
        { credentials: "include" }
      ).then((r) => r.json());
    },
    enabled: !!selectedProject,
    staleTime: 30_000,
  });

  async function install() {
    if (!selectedVersion) return;
    const file = selectedVersion.files.find((f) => f.primary) ?? selectedVersion.files[0];
    if (!file) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/mods/install`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: file.url, filename: file.filename }),
      });
      if (res.ok) {
        onInstalled();
        onClose();
      } else {
        const text = await res.text();
        setInstallError(text || `Server error (${res.status})`);
      }
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : "Network error");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-full sm:max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Browse Modrinth
          </DialogTitle>
        </DialogHeader>

        {!selectedProject ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search Modrinth…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Input
                placeholder="MC version (e.g. 1.21.4)"
                value={mcVersion}
                onChange={(e) => setMcVersion(e.target.value)}
                className="h-8 text-xs w-40"
              />
            </div>
            <div className="overflow-y-auto overflow-x-hidden max-h-[50vh]">
              {searching && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
              {!searching && results && results.hits.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">No results</div>
              )}
              <div className="space-y-1.5 pr-1">
                {(results?.hits ?? []).map((hit) => (
                  <button
                    key={hit.project_id}
                    onClick={() => setSelectedProject(hit)}
                    className="w-full max-w-full box-border text-left flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    {hit.icon_url
                      ? <img src={hit.icon_url} alt="" className="w-10 h-10 rounded-md shrink-0 object-cover" />
                      : <div className="w-10 h-10 rounded-md shrink-0 bg-muted flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{hit.title}</p>
                        <Badge variant="outline" className="text-[10px] h-4 shrink-0">{hit.downloads.toLocaleString()} ↓</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 break-words">{hit.description}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {hit.categories.slice(0, 3).map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px] h-3.5 px-1">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setSelectedProject(null); setSelectedVersion(null); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <div className="flex items-center gap-2">
                {selectedProject.icon_url && <img src={selectedProject.icon_url} alt="" className="w-6 h-6 rounded" />}
                <span className="text-sm font-medium">{selectedProject.title}</span>
              </div>
            </div>

            {loadingVersions && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

            {!loadingVersions && versions && versions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <AlertCircle className="w-7 h-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No compatible versions found for this server type.</p>
                <Button variant="outline" size="sm" className="h-7 text-xs mt-1" asChild>
                  <a href={`https://modrinth.com/mod/${selectedProject.slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />View on Modrinth
                  </a>
                </Button>
              </div>
            )}

            {!loadingVersions && versions && versions.length > 0 && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Select version</Label>
                  <Select onValueChange={(v) => { setSelectedVersion(versions.find((x) => x.id === v) ?? null); setInstallError(null); }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a version…" />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          {v.name} — {v.game_versions.slice(-1)[0]} [{v.loaders.join(", ")}]
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedVersion && (
                  <div className="p-3 rounded-lg border bg-muted/20 text-xs space-y-1">
                    <p><span className="text-muted-foreground">File:</span> {selectedVersion.files.find((f) => f.primary)?.filename ?? selectedVersion.files[0]?.filename}</p>
                    <p><span className="text-muted-foreground">MC:</span> {selectedVersion.game_versions.join(", ")}</p>
                    <p><span className="text-muted-foreground">Loaders:</span> {selectedVersion.loaders.join(", ")}</p>
                  </div>
                )}

                {installError && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/40 bg-destructive/10 text-xs text-destructive">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{installError}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    className="flex-1 h-8 text-xs"
                    disabled={!selectedVersion || installing}
                    onClick={() => void install()}
                  >
                    {installing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                    Install
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <a href={`https://modrinth.com/mod/${selectedProject.slug}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function ServerPlugins({ serverId }: { serverId: string }) {
  const id = serverId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showBrowse, setShowBrowse] = useState(false);
  const [showUrlInstall, setShowUrlInstall] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlNameInput, setUrlNameInput] = useState("");
  const [urlError, setUrlError] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<ModsResponse>({
    queryKey: ["mods", id],
    queryFn: () => fetch(`/api/servers/${id}/mods`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (filename: string) =>
      fetch(`/api/servers/${id}/mods/${encodeURIComponent(filename)}/toggle`, {
        method: "POST", credentials: "include",
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["mods", id] }),
  });

  const deleteMut = useMutation({
    mutationFn: (filename: string) =>
      fetch(`/api/servers/${id}/mods/${encodeURIComponent(filename)}`, {
        method: "DELETE", credentials: "include",
      }),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["mods", id] });
    },
  });

  const urlInstallMut = useMutation({
    mutationFn: ({ url, name }: { url: string; name: string }) =>
      fetch(`/api/servers/${id}/mods/install-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name: name || undefined }),
      }).then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      setShowUrlInstall(false);
      setUrlInput(""); setUrlNameInput(""); setUrlError("");
      void queryClient.invalidateQueries({ queryKey: ["mods", id] });
    },
    onError: (e) => setUrlError(e instanceof Error ? e.message : "Install failed"),
  });

  const type = data?.type ?? "plugins";
  const label = type === "mods" ? "Mods" : "Plugins";
  const Icon = type === "mods" ? Puzzle : Package;

  const allItems = data?.items ?? [];
  const items = allItems.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.version ?? "").includes(search)
  );
  const enabledCount = allItems.filter((p) => p.enabled).length;

  return (
    <div className="p-4 space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-gradient-to-br from-red-950/50 to-red-900/30 border-red-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-red-500/20 rounded-md border border-red-600/30">
              <Icon className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Installed</p>
              {isLoading ? <Skeleton className="h-5 w-8 mt-0.5" /> : <p className="text-base font-semibold">{allItems.length}</p>}
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-green-950/50 to-green-900/30 border-green-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-md border border-green-600/30">
              <Power className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enabled</p>
              {isLoading ? <Skeleton className="h-5 w-8 mt-0.5" /> : <p className="text-base font-semibold">{enabledCount}</p>}
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
              {isLoading ? <Skeleton className="h-5 w-14 mt-0.5" /> : <p className="text-base font-semibold">{formatBytes(allItems.reduce((acc, p) => acc + p.size, 0))}</p>}
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Installed {label}</h3>
            {!isLoading && <Badge variant="secondary" className="text-[10px] h-4">{allItems.length}</Badge>}
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowBrowse(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              Browse Modrinth
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowUrlInstall(true)}
            >
              <Download className="w-3 h-3 mr-1" />
              Install URL
            </Button>
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
        </div>

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
                        className={`flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors ${!item.enabled ? "opacity-60" : ""}`}
                      >
                        <div className={`p-2 rounded-md border shrink-0 ${item.enabled ? "bg-red-500/10 border-red-600/20" : "bg-muted/50 border-border"}`}>
                          <Icon className={`w-4 h-4 ${item.enabled ? "text-red-400" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{item.name}</p>
                            {item.version && <span className="text-[10px] text-muted-foreground font-mono">v{item.version}</span>}
                            <Badge variant={item.enabled ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
                              {item.enabled ? "enabled" : "disabled"}
                            </Badge>
                            {item.source === "modrinth" && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-green-600/30 text-green-400 bg-green-600/10">Modrinth</Badge>
                            )}
                            {item.source === "url" && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-600/30 text-blue-400 bg-blue-600/10">URL</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-[11px] text-muted-foreground truncate font-mono">{item.filename}</p>
                            {item.slug && (
                              <a href={`https://modrinth.com/plugin/${item.slug}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0" onClick={(e) => e.stopPropagation()}>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 hidden sm:block">
                          <p className="text-[11px] text-muted-foreground">{formatBytes(item.size)}</p>
                          <p className="text-[10px] text-muted-foreground/60">{new Date(item.modifiedAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title={item.enabled ? "Disable" : "Enable"}
                            onClick={() => toggleMut.mutate(item.filename)}
                            disabled={toggleMut.isPending}
                          >
                            {item.enabled
                              ? <PowerOff className="w-3.5 h-3.5 text-muted-foreground hover:text-yellow-400" />
                              : <Power className="w-3.5 h-3.5 text-muted-foreground hover:text-green-400" />
                            }
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 hover:text-destructive"
                            title="Delete"
                            onClick={() => setDeleteTarget(item.filename)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label.slice(0, -1)}?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-xs">{deleteTarget}</span> will be permanently deleted from the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/80"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* URL Install dialog */}
      <Dialog open={showUrlInstall} onOpenChange={(o) => { if (!o) { setShowUrlInstall(false); setUrlInput(""); setUrlNameInput(""); setUrlError(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Install from URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">Paste a direct download link to a <span className="font-mono">.jar</span> file (GitHub releases, Hangar, SpigotMC, etc.).</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Download URL <span className="text-red-400">*</span></Label>
              <Input
                placeholder="https://github.com/owner/repo/releases/download/v1.0/plugin.jar"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Plugin name (optional)</Label>
              <Input
                placeholder="My Plugin"
                value={urlNameInput}
                onChange={(e) => setUrlNameInput(e.target.value)}
                className="text-xs"
              />
            </div>
            {urlError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{urlError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowUrlInstall(false)}>Cancel</Button>
              <Button
                size="sm" className="flex-1"
                disabled={!urlInput || urlInstallMut.isPending}
                onClick={() => urlInstallMut.mutate({ url: urlInput, name: urlNameInput })}
              >
                {urlInstallMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                Install
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modrinth browser */}
      {showBrowse && (
        <ModrinthDialog
          serverId={id}
          modType={type === "none" ? "plugins" : type}
          onClose={() => setShowBrowse(false)}
          onInstalled={() => void queryClient.invalidateQueries({ queryKey: ["mods", id] })}
        />
      )}
    </div>
  );
}

