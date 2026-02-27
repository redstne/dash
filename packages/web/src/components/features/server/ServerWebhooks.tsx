
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bell, Plus, Trash2, FlaskConical, RefreshCw, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";


const ALL_EVENTS = [
  { id: "alert.critical",  label: "Critical alert",     color: "text-red-400" },
  { id: "alert.warning",   label: "Warning alert",      color: "text-orange-400" },
  { id: "server.offline",  label: "Server offline",     color: "text-red-400" },
  { id: "server.online",   label: "Server online",      color: "text-green-400" },
  { id: "player.join",     label: "Player join",        color: "text-blue-400" },
  { id: "player.leave",    label: "Player leave",       color: "text-blue-400" },
  { id: "player.kick",     label: "Player kick",        color: "text-yellow-400" },
  { id: "player.ban",      label: "Player ban",         color: "text-red-400" },
  { id: "backup.failed",   label: "Backup failed",      color: "text-red-400" },
  { id: "backup.success",  label: "Backup success",     color: "text-green-400" },
];

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
}

function WebhookForm({ initial, onSubmit, onCancel, loading }: {
  initial?: Partial<Webhook>;
  onSubmit: (data: Omit<Webhook, "id">) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [events, setEvents] = useState<string[]>(initial?.events ?? ["alert.critical", "server.offline"]);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  function toggleEvent(ev: string) {
    setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Name</Label>
        <Input className="mt-1 h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. #alerts Discord" />
      </div>
      <div>
        <Label className="text-xs">Webhook URL (Discord, Slack, etc.)</Label>
        <Input className="mt-1 h-8 text-xs font-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
      </div>
      <div>
        <Label className="text-xs mb-2 block">Events to notify</Label>
        <div className="grid grid-cols-2 gap-1">
          {ALL_EVENTS.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => toggleEvent(ev.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border transition-colors ${events.includes(ev.id) ? "bg-primary/10 border-primary/40 text-foreground" : "bg-muted/20 border-border text-muted-foreground"}`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${events.includes(ev.id) ? "bg-primary" : "bg-muted-foreground/30"}`} />
              <span className={ev.color}>{ev.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="wh-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="wh-enabled" className="text-xs cursor-pointer">Enabled</Label>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-8 text-xs" disabled={!name.trim() || !url.trim() || events.length === 0 || loading}
          onClick={() => onSubmit({ name, url, events, enabled })}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function ServerWebhooks({ serverId }: { serverId: string }) {
  const id = serverId;
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, "ok" | "fail">>({});
  const [testing, setTesting] = useState<string | null>(null);

  const { data: hooks = [], isLoading, refetch } = useQuery<Webhook[]>({
    queryKey: ["webhooks", id],
    queryFn: () => fetch(`/api/servers/${id}/webhooks`, { credentials: "include" }).then((r) => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (body: object) => fetch(`/api/servers/${id}/webhooks`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { setShowCreate(false); void queryClient.invalidateQueries({ queryKey: ["webhooks", id] }); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ hookId, enabled }: { hookId: string; enabled: boolean }) =>
      fetch(`/api/servers/${id}/webhooks/${hookId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["webhooks", id] }),
  });

  const deleteMut = useMutation({
    mutationFn: (hookId: string) => fetch(`/api/servers/${id}/webhooks/${hookId}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { setDeleteTarget(null); void queryClient.invalidateQueries({ queryKey: ["webhooks", id] }); },
  });

  async function testHook(hookId: string) {
    setTesting(hookId);
    try {
      const res = await fetch(`/api/servers/${id}/webhooks/${hookId}/test`, { method: "POST", credentials: "include" });
      const data = await res.json() as { success: boolean };
      setTestResult((prev) => ({ ...prev, [hookId]: data.success ? "ok" : "fail" }));
      setTimeout(() => setTestResult((prev) => { const n = { ...prev }; delete n[hookId]; return n; }), 4000);
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Webhooks</h3>
            {!isLoading && <Badge variant="secondary" className="text-[10px] h-4">{hooks.length}</Badge>}
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="w-3 h-3 mr-1" /> Add Webhook
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => void refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Send notifications to Discord, Slack, or any webhook URL when server events occur.
        </p>

        <ScrollArea className="h-[420px]">
          <div className="space-y-2 pr-1">
            {isLoading
              ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
              : hooks.length === 0
                ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Bell className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No webhooks configured</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Add a Discord or Slack webhook to get notified of server events</p>
                  </div>
                )
                : hooks.map((hook) => (
                  <div key={hook.id} className={`p-3 rounded-lg border bg-card ${!hook.enabled ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{hook.name}</p>
                        <Badge variant={hook.enabled ? "default" : "secondary"} className="text-[10px] h-4">
                          {hook.enabled ? "active" : "disabled"}
                        </Badge>
                        {testResult[hook.id] === "ok" && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                        {testResult[hook.id] === "fail" && <XCircle className="w-4 h-4 text-red-400" />}
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={hook.enabled}
                          onCheckedChange={(v) => toggleMut.mutate({ hookId: hook.id, enabled: v })}
                          className="scale-75"
                        />
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Send test" onClick={() => void testHook(hook.id)} disabled={testing === hook.id}>
                          {testing === hook.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => setDeleteTarget(hook.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate mb-2">{hook.url}</p>
                    <div className="flex flex-wrap gap-1">
                      {hook.events.map((ev) => (
                        <Badge key={ev} variant="outline" className="text-[10px] h-4 px-1.5">{ev}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
          </div>
        </ScrollArea>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Webhook</DialogTitle></DialogHeader>
          <WebhookForm onSubmit={(data) => createMut.mutate(data)} onCancel={() => setShowCreate(false)} loading={createMut.isPending} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
            <AlertDialogDescription>This webhook will stop sending notifications.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/80" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
