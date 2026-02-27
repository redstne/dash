
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Globe2, Download, RotateCcw, Upload, HardDrive } from "lucide-react";


interface World {
  name: string;
  sizeBytes: number;
  lastModified: string;
  isActive: boolean;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function ServerWorlds({ serverId }: { serverId: string }) {
  const id = serverId;
  const qc = useQueryClient();
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: worlds = [], isLoading } = useQuery<World[]>({
    queryKey: ["worlds", id],
    queryFn: () => fetch(`/api/servers/${id}/worlds`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const resetMutation = useMutation({
    mutationFn: (name: string) =>
      fetch(`/api/servers/${id}/worlds/${encodeURIComponent(name)}/reset`, {
        method: "POST",
        credentials: "include",
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worlds", id] }),
  });

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/servers/${id}/worlds/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (res.ok) {
        setUploadMsg("World uploaded successfully!");
        qc.invalidateQueries({ queryKey: ["worlds", id] });
      } else {
        const text = await res.text();
        setUploadMsg(`Error: ${text}`);
      }
    } catch {
      setUploadMsg("Upload failed");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadMsg(null), 4000);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-red-500" />
          <h2 className="text-base font-semibold">Worlds</h2>
        </div>
        <div className="flex items-center gap-2">
          {uploadMsg && <span className="text-xs text-muted-foreground">{uploadMsg}</span>}
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" />
            {uploading ? "Uploading…" : "Upload World"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.tar.gz,.tgz"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : worlds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Globe2 className="w-10 h-10 opacity-30" />
          <p className="text-sm">No worlds found. Make sure the server volume is mounted and logPath is configured.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {worlds.map((world) => (
            <Card key={world.name} className={`border-border/60 ${world.isActive ? "border-green-600/30 bg-green-950/5" : ""}`}>
              <CardContent className="pt-4 pb-4 px-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{world.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Modified {new Date(world.lastModified).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {world.isActive && (
                      <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px] px-1.5 py-0">Active</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                      <HardDrive className="w-2.5 h-2.5" />
                      {fmtSize(world.sizeBytes)}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 flex-1"
                    asChild
                  >
                    <a
                      href={`/api/servers/${id}/worlds/${encodeURIComponent(world.name)}/download`}
                      download={`${world.name}.tar.gz`}
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 flex-1 border-red-600/30 text-red-400 hover:bg-red-950/20"
                    onClick={() => setResetTarget(world.name)}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset world "{resetTarget}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The world folder will be renamed to <code className="text-xs bg-muted px-1 rounded">{resetTarget}.bak.TIMESTAMP</code> and replaced with an empty directory.
              The server will generate a fresh world on next start. This cannot be undone easily.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (resetTarget) {
                  resetMutation.mutate(resetTarget);
                  setResetTarget(null);
                }
              }}
            >
              Reset World
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
