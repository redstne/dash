import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Download, Trash2, RotateCcw, Plus, Clock, HardDrive,
  Calendar, CheckCircle2, AlertCircle, Cloud, Play, Settings,
  Loader2, FolderOpen, Server, Wifi,
} from "lucide-react";

export const Route = createFileRoute("/_app/servers/$id/backups")({
  component: BackupsPage,
});

// ── Types ────────────────────────────────────────────────────────────────

interface BackupConfig {
  id: string;
  name: string;
  storageType: "local" | "s3" | "sftp" | "rclone";
  schedule: string;
  retentionCount: number;
  enabled: boolean;
  lastRunAt: number | null;
  createdAt: number;
}

interface BackupRun {
  id: string;
  serverId: string;
  configId: string | null;
  configName: string | null;
  status: "running" | "success" | "failed";
  startedAt: number;
  finishedAt: number | null;
  sizeBytes: number | null;
  filename: string | null;
  localPath: string | null;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts * 1000;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function storageIcon(type: string) {
  switch (type) {
    case "s3": return <Cloud className="w-4 h-4 text-orange-400" />;
    case "sftp": return <Wifi className="w-4 h-4 text-blue-400" />;
    case "rclone": return <Cloud className="w-4 h-4 text-purple-400" />;
    default: return <HardDrive className="w-4 h-4 text-green-400" />;
  }
}

const STORAGE_LABELS: Record<string, string> = {
  local: "Local", s3: "S3 / B2 / Wasabi", sftp: "SFTP", rclone: "Rclone Remote",
};

// ── New Destination form state ────────────────────────────────────────────

interface DestForm {
  name: string;
  storageType: "local" | "s3" | "sftp" | "rclone";
  schedule: string;
  retentionCount: number;
  // local
  localPath: string;
  // s3
  s3Endpoint: string; s3Region: string; s3Bucket: string; s3Prefix: string;
  s3AccessKey: string; s3SecretKey: string;
  // sftp
  sftpHost: string; sftpPort: string; sftpUser: string; sftpPassword: string; sftpPath: string;
  // rclone
  rcloneRemote: string; rclonePath: string;
}

const EMPTY_FORM: DestForm = {
  name: "", storageType: "local", schedule: "daily", retentionCount: 7,
  localPath: "/data/backups",
  s3Endpoint: "", s3Region: "us-east-1", s3Bucket: "", s3Prefix: "minecraft/backups",
  s3AccessKey: "", s3SecretKey: "",
  sftpHost: "", sftpPort: "22", sftpUser: "", sftpPassword: "", sftpPath: "/backups",
  rcloneRemote: "", rclonePath: "minecraft/backups",
};

function formToConfig(f: DestForm) {
  if (f.storageType === "local") return { type: "local" as const, path: f.localPath || undefined };
  if (f.storageType === "s3") return {
    type: "s3" as const,
    endpoint: f.s3Endpoint, region: f.s3Region, bucket: f.s3Bucket,
    prefix: f.s3Prefix, accessKey: f.s3AccessKey, secretKey: f.s3SecretKey,
  };
  if (f.storageType === "sftp") return {
    type: "sftp" as const,
    host: f.sftpHost, port: parseInt(f.sftpPort) || 22,
    user: f.sftpUser, password: f.sftpPassword, path: f.sftpPath,
  };
  return { type: "rclone" as const, remote: f.rcloneRemote, path: f.rclonePath };
}

// ── Main component ────────────────────────────────────────────────────────

function BackupsPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────
  const { data: configs = [], isLoading: configsLoading } = useQuery<BackupConfig[]>({
    queryKey: ["backup-configs", id],
    queryFn: () => fetch(`/api/servers/${id}/backups/configs`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery<BackupRun[]>({
    queryKey: ["backup-runs", id],
    queryFn: () => fetch(`/api/servers/${id}/backups/runs`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 5_000, // poll often while runs may be "running"
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const createConfig = useMutation({
    mutationFn: (body: object) =>
      fetch(`/api/servers/${id}/backups/configs`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => { if (!r.ok) throw new Error("Failed to save config"); return r.json(); }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["backup-configs", id] }); setDestOpen(false); setForm(EMPTY_FORM); },
  });

  const updateConfig = useMutation({
    mutationFn: ({ configId, body }: { configId: string; body: object }) =>
      fetch(`/api/servers/${id}/backups/configs/${configId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["backup-configs", id] }),
  });

  const deleteConfig = useMutation({
    mutationFn: (configId: string) =>
      fetch(`/api/servers/${id}/backups/configs/${configId}`, {
        method: "DELETE", credentials: "include",
      }).then((r) => r.json()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["backup-configs", id] }); setDeleteConfigOpen(false); },
  });

  const triggerBackup = useMutation({
    mutationFn: (configId: string) =>
      fetch(`/api/servers/${id}/backups/trigger`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId }),
      }).then((r) => { if (!r.ok) throw new Error("Failed to trigger backup"); return r.json(); }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["backup-runs", id] }),
  });

  // ── Dialog state ────────────────────────────────────────────────────────
  const [destOpen, setDestOpen] = useState(false);
  const [deleteConfigOpen, setDeleteConfigOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<BackupConfig | null>(null);
  const [triggerConfigId, setTriggerConfigId] = useState<string | null>(null);
  const [form, setForm] = useState<DestForm>(EMPTY_FORM);
  const setF = (k: keyof DestForm, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  // ── Stats ───────────────────────────────────────────────────────────────
  const successRuns = runs.filter((r) => r.status === "success");
  const runningRuns = runs.filter((r) => r.status === "running");
  const totalSize = successRuns.reduce((s, r) => s + (r.sizeBytes ?? 0), 0);
  const lastRun = successRuns[0];

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-gradient-to-br from-blue-950/50 to-blue-900/30 border-blue-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded-md border border-blue-600/30"><HardDrive className="w-4 h-4 text-blue-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Backups</p>
              {runsLoading ? <Skeleton className="h-4 w-6 mt-0.5" /> : (
                <p className="text-base font-semibold text-blue-400">{successRuns.length}</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-purple-950/50 to-purple-900/30 border-purple-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-500/20 rounded-md border border-purple-600/30"><Server className="w-4 h-4 text-purple-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Size</p>
              {runsLoading ? <Skeleton className="h-4 w-14 mt-0.5" /> : (
                <p className="text-base font-semibold text-purple-400">{formatBytes(totalSize)}</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-green-950/50 to-green-900/30 border-green-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-md border border-green-600/30"><Clock className="w-4 h-4 text-green-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Last Backup</p>
              {runsLoading ? <Skeleton className="h-4 w-12 mt-0.5" /> : (
                <p className="text-base font-semibold text-green-400">
                  {lastRun ? relativeTime(lastRun.startedAt) : "Never"}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Destinations */}
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <Cloud className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Backup Destinations</h3>
          <Button
            onClick={() => { setForm(EMPTY_FORM); setDestOpen(true); }}
            size="sm"
            className="ml-auto h-7 text-xs bg-red-600 hover:bg-red-700"
          >
            <Plus className="w-3 h-3 mr-1" />New Destination
          </Button>
        </div>

        {configsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <HardDrive className="w-8 h-8 opacity-40" />
            <p className="text-sm">No backup destinations configured</p>
            <p className="text-xs opacity-60">Add a destination to start backing up your server</p>
          </div>
        ) : (
          <div className="space-y-2">
            {configs.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card/50">
                <div className="p-1.5 rounded-md border bg-card">
                  {storageIcon(c.storageType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{c.name}</p>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {STORAGE_LABELS[c.storageType]}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${
                      c.schedule === "manual"
                        ? "bg-gray-500/10 text-gray-400 border-gray-600/30"
                        : "bg-blue-500/10 text-blue-400 border-blue-600/30"
                    }`}>
                      {c.schedule}
                    </Badge>
                    {!c.enabled && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Disabled</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Keep {c.retentionCount} backups
                    {c.lastRunAt ? ` · Last run ${relativeTime(c.lastRunAt)}` : " · Never run"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-green-400 hover:bg-green-500/10"
                    onClick={() => {
                      setTriggerConfigId(c.id);
                      triggerBackup.mutate(c.id);
                    }}
                    disabled={triggerBackup.isPending && triggerConfigId === c.id}
                    title="Run backup now"
                  >
                    {triggerBackup.isPending && triggerConfigId === c.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Play className="w-3 h-3" />
                    }
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:bg-accent"
                    onClick={() => {
                      updateConfig.mutate({ configId: c.id, body: { enabled: !c.enabled } });
                    }}
                    title={c.enabled ? "Disable" : "Enable"}
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-red-400 hover:bg-red-500/10"
                    onClick={() => { setSelectedConfig(c); setDeleteConfigOpen(true); }}
                    title="Delete destination"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Backup history */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Backup History</h3>
          <div className="flex items-center gap-2">
            {runningRuns.length > 0 && (
              <Badge className="text-[10px] h-4 px-1.5 bg-blue-600/20 text-blue-400 border-blue-600/30 animate-pulse">
                {runningRuns.length} running
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">{runs.length} total</Badge>
          </div>
        </div>
        <Tabs defaultValue="all">
          <TabsList className="grid w-full grid-cols-3 mb-3">
            <TabsTrigger value="all" className="text-xs">All ({runs.length})</TabsTrigger>
            <TabsTrigger value="success" className="text-xs">
              Success ({successRuns.length})
            </TabsTrigger>
            <TabsTrigger value="failed" className="text-xs">
              Failed ({runs.filter((r) => r.status === "failed").length})
            </TabsTrigger>
          </TabsList>
          {(["all", "success", "failed"] as const).map((tab) => {
            const list =
              tab === "all" ? runs
              : tab === "success" ? successRuns
              : runs.filter((r) => r.status === "failed");
            return (
              <TabsContent key={tab} value={tab}>
                {runsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : list.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No {tab} backups</div>
                ) : (
                  <ScrollArea className="h-[320px]">
                    <div className="space-y-2">
                      {list.map((run) => (
                        <div key={run.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          run.status === "running" ? "bg-blue-950/20 border-blue-600/30 animate-pulse"
                          : run.status === "success" ? "bg-card/50 border-border"
                          : "bg-red-950/20 border-red-600/30"
                        }`}>
                          <div className={`p-1.5 rounded-md border ${
                            run.status === "running" ? "bg-blue-500/10 border-blue-600/30"
                            : run.status === "success" ? "bg-green-500/10 border-green-600/30"
                            : "bg-red-500/10 border-red-600/30"
                          }`}>
                            {run.status === "running"
                              ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                              : run.status === "success"
                              ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                              : <AlertCircle className="w-4 h-4 text-red-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">
                                {run.configName ?? "Manual"}
                              </p>
                              <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${
                                run.status === "success" ? "bg-green-500/10 text-green-400 border-green-600/30"
                                : run.status === "running" ? "bg-blue-500/10 text-blue-400 border-blue-600/30"
                                : "bg-red-500/10 text-red-400 border-red-600/30"
                              }`}>
                                {run.status}
                              </Badge>
                              {run.sizeBytes && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                  {formatBytes(run.sizeBytes)}
                                </Badge>
                              )}
                            </div>
                            {run.error ? (
                              <p className="text-[11px] text-red-400 mt-0.5 truncate">{run.error}</p>
                            ) : run.filename ? (
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                                <FolderOpen className="w-3 h-3" />{run.filename}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {relativeTime(run.startedAt)}
                            </span>
                            {run.status === "success" && run.localPath && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-6 w-6 text-blue-400 hover:bg-blue-500/10"
                                title="Download backup"
                                onClick={() => {
                                  window.open(`/api/servers/${id}/backups/runs/${run.id}/download`, "_blank");
                                }}
                              >
                                <Download className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </Card>

      {/* ── New Destination Dialog ── */}
      <Dialog open={destOpen} onOpenChange={setDestOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Backup Destination</DialogTitle>
            <DialogDescription>Configure where your server backups will be stored.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Destination Name</Label>
              <Input placeholder="e.g., Proton Drive Daily" value={form.name} onChange={(e) => setF("name", e.target.value)}
                className="bg-black/30 border-red-600/30" />
            </div>
            <div className="grid gap-1.5">
              <Label>Storage Type</Label>
              <Select value={form.storageType} onValueChange={(v) => setF("storageType", v)}>
                <SelectTrigger className="bg-black/30 border-red-600/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">🖥️ Local (save on server)</SelectItem>
                  <SelectItem value="s3">☁️ S3 / Backblaze B2 / Wasabi</SelectItem>
                  <SelectItem value="sftp">🔒 SFTP</SelectItem>
                  <SelectItem value="rclone">🔄 Rclone Remote (Proton Drive, GDrive…)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Local */}
            {form.storageType === "local" && (
              <div className="grid gap-1.5">
                <Label>Destination Path</Label>
                <Input placeholder="/data/backups" value={form.localPath} onChange={(e) => setF("localPath", e.target.value)}
                  className="bg-black/30 border-red-600/30" />
              </div>
            )}

            {/* S3 */}
            {form.storageType === "s3" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label>Endpoint</Label>
                    <Input placeholder="s3.amazonaws.com" value={form.s3Endpoint} onChange={(e) => setF("s3Endpoint", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Region</Label>
                    <Input placeholder="us-east-1" value={form.s3Region} onChange={(e) => setF("s3Region", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label>Bucket</Label>
                    <Input placeholder="my-bucket" value={form.s3Bucket} onChange={(e) => setF("s3Bucket", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Prefix / Folder</Label>
                    <Input placeholder="minecraft/backups" value={form.s3Prefix} onChange={(e) => setF("s3Prefix", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Access Key</Label>
                  <Input placeholder="AKIAIOSFODNN7EXAMPLE" value={form.s3AccessKey} onChange={(e) => setF("s3AccessKey", e.target.value)} className="bg-black/30 border-red-600/30" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Secret Key</Label>
                  <Input type="password" placeholder="wJalrXUtnFEMI…" value={form.s3SecretKey} onChange={(e) => setF("s3SecretKey", e.target.value)} className="bg-black/30 border-red-600/30" />
                </div>
              </>
            )}

            {/* SFTP */}
            {form.storageType === "sftp" && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 grid gap-1.5">
                    <Label>Host</Label>
                    <Input placeholder="backup.example.com" value={form.sftpHost} onChange={(e) => setF("sftpHost", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Port</Label>
                    <Input placeholder="22" value={form.sftpPort} onChange={(e) => setF("sftpPort", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label>Username</Label>
                    <Input value={form.sftpUser} onChange={(e) => setF("sftpUser", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Password</Label>
                    <Input type="password" value={form.sftpPassword} onChange={(e) => setF("sftpPassword", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Remote Path</Label>
                  <Input placeholder="/backups" value={form.sftpPath} onChange={(e) => setF("sftpPath", e.target.value)} className="bg-black/30 border-red-600/30" />
                </div>
              </>
            )}

            {/* Rclone */}
            {form.storageType === "rclone" && (
              <>
                <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-600/30 text-xs text-blue-300 space-y-1">
                  <p className="font-medium">Pre-configured rclone remote</p>
                  <p>Mount your rclone config in docker-compose.yml:</p>
                  <code className="block bg-black/40 p-1.5 rounded text-[11px]">
                    - ./data/rclone.conf:/root/.config/rclone/rclone.conf:ro
                  </code>
                  <p>Then run <code className="bg-black/40 px-1 rounded">rclone config</code> on the host to add your remote (Proton Drive, Google Drive, etc.)</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label>Remote Name</Label>
                    <Input placeholder="proton" value={form.rcloneRemote} onChange={(e) => setF("rcloneRemote", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Remote Path</Label>
                    <Input placeholder="Backups/minecraft" value={form.rclonePath} onChange={(e) => setF("rclonePath", e.target.value)} className="bg-black/30 border-red-600/30" />
                  </div>
                </div>
              </>
            )}

            {/* Schedule & retention */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
              <div className="grid gap-1.5">
                <Label>Schedule</Label>
                <Select value={form.schedule} onValueChange={(v) => setF("schedule", v)}>
                  <SelectTrigger className="bg-black/30 border-red-600/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual only</SelectItem>
                    <SelectItem value="hourly">Every hour</SelectItem>
                    <SelectItem value="6h">Every 6 hours</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Keep last N backups</Label>
                <Input type="number" min={1} max={100} value={form.retentionCount}
                  onChange={(e) => setF("retentionCount", parseInt(e.target.value) || 7)}
                  className="bg-black/30 border-red-600/30" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDestOpen(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={!form.name || createConfig.isPending}
              onClick={() => {
                createConfig.mutate({
                  name: form.name,
                  config: formToConfig(form),
                  schedule: form.schedule,
                  retentionCount: form.retentionCount,
                });
              }}
            >
              {createConfig.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Save Destination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete config confirm */}
      <AlertDialog open={deleteConfigOpen} onOpenChange={setDeleteConfigOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Destination?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{selectedConfig?.name}"? This will not delete existing backups, only the configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedConfig && deleteConfig.mutate(selectedConfig.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
