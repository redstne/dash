
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Clock, Plus, Play, Trash2, RefreshCw, Terminal, RotateCcw, Square,
  Loader2, Edit2, Check, X,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";


type TaskType = "command" | "restart" | "stop";
type Schedule = "hourly" | "2h" | "6h" | "daily" | "weekly";

interface ScheduledTask {
  id: string;
  name: string;
  type: TaskType;
  command: string | null;
  schedule: Schedule;
  timeOfDay: string | null;
  dayOfWeek: number | null;
  enabled: boolean;
  lastRunAt: string | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SCHEDULE_LABELS: Record<Schedule, string> = {
  hourly: "Every hour", "2h": "Every 2 hours", "6h": "Every 6 hours",
  daily: "Daily", weekly: "Weekly",
};
const TYPE_ICONS: Record<TaskType, React.ElementType> = {
  command: Terminal, restart: RotateCcw, stop: Square,
};

function TaskForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Partial<ScheduledTask>;
  onSubmit: (data: Omit<ScheduledTask, "id" | "lastRunAt">) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<TaskType>(initial?.type ?? "command");
  const [command, setCommand] = useState(initial?.command ?? "");
  const [schedule, setSchedule] = useState<Schedule>(initial?.schedule ?? "daily");
  const [timeOfDay, setTimeOfDay] = useState(initial?.timeOfDay ?? "04:00");
  const [dayOfWeek, setDayOfWeek] = useState<number>(initial?.dayOfWeek ?? 0);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const needsTime = schedule === "daily" || schedule === "weekly";

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Task name</Label>
        <Input className="mt-1 h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nightly restart" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="command" className="text-xs">Run RCON command</SelectItem>
              <SelectItem value="restart" className="text-xs">Restart server</SelectItem>
              <SelectItem value="stop" className="text-xs">Stop server</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Schedule</Label>
          <Select value={schedule} onValueChange={(v) => setSchedule(v as Schedule)}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(SCHEDULE_LABELS) as [Schedule, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {type === "command" && (
        <div>
          <Label className="text-xs">RCON command</Label>
          <Input className="mt-1 h-8 text-xs font-mono" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="say Server restarting in 5 minutes!" />
        </div>
      )}
      {needsTime && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Time (UTC)</Label>
            <Input type="time" className="mt-1 h-8 text-xs" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
          </div>
          {schedule === "weekly" && (
            <div>
              <Label className="text-xs">Day of week</Label>
              <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => <SelectItem key={i} value={String(i)} className="text-xs">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="enabled" className="text-xs cursor-pointer">Enabled</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-8 text-xs" disabled={!name.trim() || loading} onClick={() =>
          onSubmit({ name, type, command: type === "command" ? command : null, schedule, timeOfDay: needsTime ? timeOfDay : null, dayOfWeek: schedule === "weekly" ? dayOfWeek : null, enabled })
        }>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

export function ServerSchedule({ serverId }: { serverId: string }) {
  const id = serverId;
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const { data: tasks = [], isLoading, refetch } = useQuery<ScheduledTask[]>({
    queryKey: ["schedule", id],
    queryFn: () => fetch(`/api/servers/${id}/schedule`, { credentials: "include" }).then((r) => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (body: object) => fetch(`/api/servers/${id}/schedule`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { setShowCreate(false); void queryClient.invalidateQueries({ queryKey: ["schedule", id] }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: object }) =>
      fetch(`/api/servers/${id}/schedule/${taskId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { setEditTask(null); void queryClient.invalidateQueries({ queryKey: ["schedule", id] }); },
  });

  const deleteMut = useMutation({
    mutationFn: (taskId: string) => fetch(`/api/servers/${id}/schedule/${taskId}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { setDeleteTarget(null); void queryClient.invalidateQueries({ queryKey: ["schedule", id] }); },
  });

  async function runNow(taskId: string) {
    setRunningId(taskId);
    await fetch(`/api/servers/${id}/schedule/${taskId}/run`, { method: "POST", credentials: "include" });
    setRunningId(null);
    void queryClient.invalidateQueries({ queryKey: ["schedule", id] });
  }

  return (
    <div className="p-4 space-y-4">
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Scheduled Tasks</h3>
            {!isLoading && <Badge variant="secondary" className="text-[10px] h-4">{tasks.length}</Badge>}
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="w-3 h-3 mr-1" /> New Task
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => void refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[480px]">
          <div className="space-y-2 pr-1">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
              : tasks.length === 0
                ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Clock className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No scheduled tasks yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Create a task to automate server commands</p>
                  </div>
                )
                : tasks.map((task) => {
                  const Icon = TYPE_ICONS[task.type];
                  return (
                    <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${!task.enabled ? "opacity-60" : ""}`}>
                      <div className="p-2 rounded-md bg-primary/10 border border-primary/20 shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{task.name}</p>
                          <Badge variant={task.enabled ? "default" : "secondary"} className="text-[10px] h-4">{task.enabled ? "enabled" : "disabled"}</Badge>
                          <Badge variant="outline" className="text-[10px] h-4">{SCHEDULE_LABELS[task.schedule]}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {task.type === "command" ? <span className="font-mono">{task.command}</span> : task.type}
                          {task.timeOfDay && ` · ${task.timeOfDay} UTC${task.dayOfWeek !== null ? ` (${DAYS[task.dayOfWeek]})` : ""}`}
                        </p>
                        {task.lastRunAt && (
                          <p className="text-[10px] text-muted-foreground/60">Last run: {new Date(task.lastRunAt).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Run now" onClick={() => void runNow(task.id)} disabled={runningId === task.id}>
                          {runningId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-green-400" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => setEditTask(task)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" title="Delete" onClick={() => setDeleteTarget(task.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
          </div>
        </ScrollArea>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Scheduled Task</DialogTitle></DialogHeader>
          <TaskForm onSubmit={(data) => createMut.mutate(data)} onCancel={() => setShowCreate(false)} loading={createMut.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTask} onOpenChange={(o) => { if (!o) setEditTask(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          {editTask && (
            <TaskForm
              initial={editTask}
              onSubmit={(data) => updateMut.mutate({ taskId: editTask.id, body: data })}
              onCancel={() => setEditTask(null)}
              loading={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>This scheduled task will be permanently removed.</AlertDialogDescription>
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
