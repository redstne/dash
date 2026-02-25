import { useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import {
  Download,
  Trash2,
  RotateCcw,
  Plus,
  Clock,
  HardDrive,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Cloud,
  Upload,
  Link2,
  CloudOff,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface Backup {
  id: string;
  name: string;
  date: string;
  time: string;
  size: string;
  type: "manual" | "automatic";
  status: "completed" | "failed";
  location: "local" | "cloud";
  cloudProvider?: string;
}

interface CloudProvider {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  storage?: {
    used: string;
    total: string;
  };
}

const mockBackups: Backup[] = [
  {
    id: "1",
    name: "Pre-Update Backup",
    date: "2026-02-25",
    time: "14:30:00",
    size: "2.4 GB",
    type: "manual",
    status: "completed",
    location: "local",
  },
  {
    id: "2",
    name: "Daily Auto Backup",
    date: "2026-02-25",
    time: "03:00:00",
    size: "2.3 GB",
    type: "automatic",
    status: "completed",
    location: "cloud",
    cloudProvider: "Google Drive",
  },
  {
    id: "3",
    name: "Weekly Backup",
    date: "2026-02-24",
    time: "02:00:00",
    size: "2.2 GB",
    type: "automatic",
    status: "completed",
    location: "cloud",
    cloudProvider: "Proton Drive",
  },
  {
    id: "4",
    name: "Manual Save",
    date: "2026-02-23",
    time: "18:45:00",
    size: "2.1 GB",
    type: "manual",
    status: "completed",
    location: "local",
  },
  {
    id: "5",
    name: "Emergency Backup",
    date: "2026-02-22",
    time: "12:15:00",
    size: "2.0 GB",
    type: "manual",
    status: "completed",
    location: "cloud",
    cloudProvider: "Google Drive",
  },
];

const initialCloudProviders: CloudProvider[] = [
  {
    id: "google-drive",
    name: "Google Drive",
    icon: "☁️",
    connected: true,
    storage: { used: "4.7 GB", total: "15 GB" },
  },
  {
    id: "proton-drive",
    name: "Proton Drive",
    icon: "🔒",
    connected: true,
    storage: { used: "2.2 GB", total: "5 GB" },
  },
  {
    id: "dropbox",
    name: "Dropbox",
    icon: "📦",
    connected: false,
  },
  {
    id: "onedrive",
    name: "OneDrive",
    icon: "☁️",
    connected: false,
  },
];

export function Backups() {
  const [backups, setBackups] = useState<Backup[]>(mockBackups);
  const [cloudProviders, setCloudProviders] = useState<CloudProvider[]>(initialCloudProviders);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cloudConnectDialogOpen, setCloudConnectDialogOpen] = useState(false);
  const [uploadToCloudDialogOpen, setUploadToCloudDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider | null>(null);
  const [backupName, setBackupName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [cloudBackupEnabled, setCloudBackupEnabled] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState("daily");
  const [backupTime, setBackupTime] = useState("03:00");
  const [selectedCloudProvider, setSelectedCloudProvider] = useState("google-drive");

  const handleCreateBackup = () => {
    setIsCreating(true);
    setProgress(0);

    // Simulate backup progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            const newBackup: Backup = {
              id: Date.now().toString(),
              name: backupName || "Manual Backup",
              date: new Date().toISOString().split("T")[0],
              time: new Date().toTimeString().split(" ")[0],
              size: "2.5 GB",
              type: "manual",
              status: "completed",
              location: "local",
            };
            setBackups([newBackup, ...backups]);
            setIsCreating(false);
            setCreateDialogOpen(false);
            setBackupName("");
            setProgress(0);
          }, 500);
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  const handleRestore = () => {
    if (!selectedBackup) return;
    // Simulate restore
    setRestoreDialogOpen(false);
    setSelectedBackup(null);
  };

  const handleDelete = () => {
    if (!selectedBackup) return;
    setBackups(backups.filter((b) => b.id !== selectedBackup.id));
    setDeleteDialogOpen(false);
    setSelectedBackup(null);
  };

  const handleDownload = (backup: Backup) => {
    // Simulate download
    console.log("Downloading backup:", backup.name);
  };

  const handleConnectCloud = (provider: CloudProvider) => {
    // Simulate OAuth connection
    setCloudProviders(
      cloudProviders.map((p) =>
        p.id === provider.id
          ? { ...p, connected: true, storage: { used: "0 GB", total: "15 GB" } }
          : p
      )
    );
    setCloudConnectDialogOpen(false);
    setSelectedProvider(null);
  };

  const handleDisconnectCloud = (providerId: string) => {
    setCloudProviders(
      cloudProviders.map((p) =>
        p.id === providerId ? { ...p, connected: false, storage: undefined } : p
      )
    );
  };

  const handleUploadToCloud = () => {
    if (!selectedBackup) return;
    setIsUploading(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setBackups(
              backups.map((b) =>
                b.id === selectedBackup.id
                  ? {
                      ...b,
                      location: "cloud",
                      cloudProvider: cloudProviders.find((p) => p.id === selectedCloudProvider)
                        ?.name,
                    }
                  : b
              )
            );
            setIsUploading(false);
            setUploadToCloudDialogOpen(false);
            setSelectedBackup(null);
            setProgress(0);
          }, 500);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const connectedProviders = cloudProviders.filter((p) => p.connected);
  const localBackups = backups.filter((b) => b.location === "local");
  const cloudBackups = backups.filter((b) => b.location === "cloud");

  const renderBackupList = (backupList: Backup[]) => {
    return backupList.map((backup) => (
      <div
        key={backup.id}
        className="flex items-center gap-3 p-3 rounded-lg border bg-card/50 hover:bg-accent/50 transition-colors"
      >
        <div
          className={`p-2 rounded-md border ${
            backup.status === "completed"
              ? "bg-green-500/10 border-green-600/30"
              : "bg-red-500/10 border-red-600/30"
          }`}
        >
          {backup.status === "completed" ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{backup.name}</p>
            <Badge
              variant="outline"
              className={`text-[10px] h-4 px-1.5 ${
                backup.type === "automatic"
                  ? "bg-blue-500/10 text-blue-400 border-blue-600/30"
                  : "bg-orange-500/10 text-orange-400 border-orange-600/30"
              }`}
            >
              {backup.type}
            </Badge>
            {backup.location === "cloud" && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1.5 bg-purple-500/10 text-purple-400 border-purple-600/30"
              >
                <Cloud className="w-2 h-2 mr-0.5" />
                {backup.cloudProvider}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {backup.date}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {backup.time}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {backup.size}
            </span>
          </div>
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-blue-400 hover:bg-blue-500/10"
            onClick={() => handleDownload(backup)}
          >
            <Download className="w-3 h-3" />
          </Button>
          {backup.location === "local" && connectedProviders.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-purple-400 hover:bg-purple-500/10"
              onClick={() => {
                setSelectedBackup(backup);
                setUploadToCloudDialogOpen(true);
              }}
            >
              <Upload className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-green-400 hover:bg-green-500/10"
            onClick={() => {
              setSelectedBackup(backup);
              setRestoreDialogOpen(true);
            }}
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-400 hover:bg-red-500/10"
            onClick={() => {
              setSelectedBackup(backup);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    ));
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3 bg-gradient-to-br from-blue-950/50 to-blue-900/30 border-blue-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded-md border border-blue-600/30">
              <HardDrive className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Backups</p>
              <p className="text-base font-semibold text-blue-400">{backups.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-3 bg-gradient-to-br from-purple-950/50 to-purple-900/30 border-purple-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-500/20 rounded-md border border-purple-600/30">
              <HardDrive className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Size</p>
              <p className="text-base font-semibold text-purple-400">11.5 GB</p>
            </div>
          </div>
        </Card>

        <Card className="p-3 bg-gradient-to-br from-green-950/50 to-green-900/30 border-green-600/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-md border border-green-600/30">
              <Clock className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Backup</p>
              <p className="text-base font-semibold text-green-400">2 hours ago</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Actions Bar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-red-600 hover:bg-red-700 h-8 text-xs"
          >
            <Plus className="w-3 h-3 mr-1.5" />
            Create Backup
          </Button>
          <Button
            onClick={() => setScheduleDialogOpen(true)}
            variant="outline"
            className="h-8 text-xs border-red-600/30"
          >
            <Calendar className="w-3 h-3 mr-1.5" />
            Schedule Backups
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Auto Backup:</span>
            <Badge
              variant={autoBackupEnabled ? "default" : "secondary"}
              className={`text-xs ${
                autoBackupEnabled
                  ? "bg-green-600/20 text-green-400 border-green-600/30"
                  : "bg-gray-600/20 text-gray-400 border-gray-600/30"
              }`}
            >
              {autoBackupEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Backups List */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Backup History</h3>
          <Badge variant="outline" className="text-xs">
            {backups.length} backups
          </Badge>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-3">
            <TabsTrigger value="all" className="text-xs">
              All ({backups.length})
            </TabsTrigger>
            <TabsTrigger value="local" className="text-xs">
              Local ({localBackups.length})
            </TabsTrigger>
            <TabsTrigger value="cloud" className="text-xs">
              Cloud ({cloudBackups.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">{renderBackupList(backups)}</div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="local">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">{renderBackupList(localBackups)}</div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="cloud">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">{renderBackupList(cloudBackups)}</div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Cloud Storage Providers */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold">Cloud Storage Providers</h3>
          </div>
          <Badge variant="outline" className="text-xs">
            {connectedProviders.length} connected
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {cloudProviders.map((provider) => (
            <div
              key={provider.id}
              className={`p-3 rounded-lg border transition-colors ${
                provider.connected
                  ? "bg-green-950/30 border-green-600/30"
                  : "bg-card/50 border-border"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{provider.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{provider.name}</p>
                    {provider.connected && provider.storage && (
                      <p className="text-xs text-muted-foreground">
                        {provider.storage.used} / {provider.storage.total}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {provider.connected ? (
                    <>
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 bg-green-500/10 text-green-400 border-green-600/30"
                      >
                        Connected
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-400 hover:bg-red-500/10"
                        onClick={() => handleDisconnectCloud(provider.id)}
                      >
                        <CloudOff className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs border-blue-600/30"
                      onClick={() => {
                        setSelectedProvider(provider);
                        setCloudConnectDialogOpen(true);
                      }}
                    >
                      <Link2 className="w-3 h-3 mr-1" />
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Create Backup Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Backup</DialogTitle>
            <DialogDescription>
              Create a manual backup of your server. This may take a few minutes.
            </DialogDescription>
          </DialogHeader>

          {isCreating ? (
            <div className="py-6 space-y-3">
              <div className="text-center">
                <p className="text-sm font-medium mb-2">Creating backup...</p>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">{progress}% complete</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="backup-name">Backup Name</Label>
                <Input
                  id="backup-name"
                  placeholder="e.g., Pre-Update Backup"
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                  className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
                />
              </div>
            </div>
          )}

          {!isCreating && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateBackup} className="bg-red-600 hover:bg-red-700">
                <Plus className="mr-2 h-4 w-4" />
                Create Backup
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload to Cloud Dialog */}
      <Dialog open={uploadToCloudDialogOpen} onOpenChange={setUploadToCloudDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload to Cloud Storage</DialogTitle>
            <DialogDescription>
              Upload "{selectedBackup?.name}" to your cloud storage provider.
            </DialogDescription>
          </DialogHeader>

          {isUploading ? (
            <div className="py-6 space-y-3">
              <div className="text-center">
                <p className="text-sm font-medium mb-2">Uploading to cloud...</p>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">{progress}% complete</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="cloud-provider">Cloud Provider</Label>
                <Select value={selectedCloudProvider} onValueChange={setSelectedCloudProvider}>
                  <SelectTrigger
                    id="cloud-provider"
                    className="bg-black/30 border-red-600/30 focus:ring-red-600"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedProviders.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        <div className="flex items-center gap-2">
                          <span>{provider.icon}</span>
                          <span>{provider.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!isUploading && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadToCloudDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUploadToCloud} className="bg-red-600 hover:bg-red-700">
                <Upload className="mr-2 h-4 w-4" />
                Upload to Cloud
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Connect Cloud Provider Dialog */}
      <Dialog open={cloudConnectDialogOpen} onOpenChange={setCloudConnectDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Connect {selectedProvider?.name}</DialogTitle>
            <DialogDescription>
              Authorize redstnkit.dash to access your {selectedProvider?.name} account for backup
              storage.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            <div className="flex flex-col items-center gap-4">
              <div className="text-5xl">{selectedProvider?.icon}</div>
              <p className="text-sm text-center text-muted-foreground">
                You will be redirected to {selectedProvider?.name} to authorize access. Your
                credentials are never stored by redstnkit.dash.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloudConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedProvider && handleConnectCloud(selectedProvider)}
              className="bg-red-600 hover:bg-red-700"
            >
              <Link2 className="mr-2 h-4 w-4" />
              Authorize & Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Backups Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Schedule Automatic Backups</DialogTitle>
            <DialogDescription>
              Configure automatic backup schedule for your server.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Auto Backups</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically backup your server on schedule
                </p>
              </div>
              <Switch checked={autoBackupEnabled} onCheckedChange={setAutoBackupEnabled} />
            </div>

            {autoBackupEnabled && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="frequency">Backup Frequency</Label>
                  <Select value={backupFrequency} onValueChange={setBackupFrequency}>
                    <SelectTrigger
                      id="frequency"
                      className="bg-black/30 border-red-600/30 focus:ring-red-600"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Every Hour</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="time">Backup Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={backupTime}
                    onChange={(e) => setBackupTime(e.target.value)}
                    className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
                  />
                </div>
              </>
            )}

            {autoBackupEnabled && (
              <>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="space-y-0.5">
                    <Label>Cloud Backup</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically upload backups to cloud storage
                    </p>
                  </div>
                  <Switch checked={cloudBackupEnabled} onCheckedChange={setCloudBackupEnabled} />
                </div>

                {cloudBackupEnabled && connectedProviders.length > 0 && (
                  <div className="grid gap-2">
                    <Label htmlFor="cloud-provider-schedule">Cloud Provider</Label>
                    <Select value={selectedCloudProvider} onValueChange={setSelectedCloudProvider}>
                      <SelectTrigger
                        id="cloud-provider-schedule"
                        className="bg-black/30 border-red-600/30 focus:ring-red-600"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {connectedProviders.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            <div className="flex items-center gap-2">
                              <span>{provider.icon}</span>
                              <span>{provider.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {cloudBackupEnabled && connectedProviders.length === 0 && (
                  <div className="p-3 rounded-lg bg-yellow-950/30 border border-yellow-600/30">
                    <p className="text-xs text-yellow-400">
                      No cloud providers connected. Connect a provider below to enable cloud
                      backups.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => setScheduleDialogOpen(false)}
              className="bg-red-600 hover:bg-red-700"
            >
              Save Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Backup Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore your server to the state saved in "{selectedBackup?.name}". All
              current data will be replaced. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              className="bg-red-600 hover:bg-red-700"
            >
              Restore Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Backup Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedBackup?.name}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}