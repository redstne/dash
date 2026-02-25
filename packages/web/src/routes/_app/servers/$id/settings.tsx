import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings, Save, Server, Globe, Database,
  RotateCcw, Square, Trash2, Eye, EyeOff, RefreshCw,
  Sliders, AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_app/servers/$id/settings")({
  component: SettingsPage,
});

interface ServerDetails {
  id: string; name: string; host: string; rconPort: number;
  dynmapUrl: string | null; logPath: string | null; enabled: boolean;
}

// Server property definitions to display
const PROPERTY_DEFS = [
  { key: "motd",                 label: "MOTD",               type: "text",   desc: "Message shown in server browser" },
  { key: "max-players",          label: "Max Players",         type: "number", desc: "Maximum concurrent connections" },
  { key: "view-distance",        label: "View Distance",       type: "number", desc: "Chunks sent per player (2–32)" },
  { key: "simulation-distance",  label: "Simulation Distance", type: "number", desc: "Ticking radius (2–32)" },
  { key: "spawn-protection",     label: "Spawn Protection",    type: "number", desc: "Radius around spawn protected from non-ops (0 = off)" },
  { key: "difficulty",           label: "Difficulty",          type: "select", options: ["peaceful","easy","normal","hard"], desc: "World difficulty" },
  { key: "gamemode",             label: "Default Gamemode",    type: "select", options: ["survival","creative","adventure","spectator"], desc: "Starting gamemode for new players" },
  { key: "pvp",                  label: "PvP",                 type: "bool",   desc: "Allow player vs player combat" },
  { key: "white-list",           label: "Whitelist",           type: "bool",   desc: "Restrict join to whitelisted players" },
  { key: "online-mode",          label: "Online Mode",         type: "bool",   desc: "Authenticate players with Mojang" },
  { key: "hardcore",             label: "Hardcore",            type: "bool",   desc: "Permanent death ban on hardcore mode" },
  { key: "enable-command-block", label: "Command Blocks",      type: "bool",   desc: "Allow command block execution" },
  { key: "spawn-monsters",       label: "Spawn Monsters",      type: "bool",   desc: "Allow hostile mob spawning" },
  { key: "spawn-animals",        label: "Spawn Animals",       type: "bool",   desc: "Allow passive mob spawning" },
] as const;

function Section({ icon: Icon, title, children, danger, trailing }: {
  icon: React.ElementType; title: string; children: React.ReactNode; danger?: boolean; trailing?: React.ReactNode;
}) {
  return (
    <Card className={`p-4 ${danger ? "border-red-600/40 bg-red-950/10" : ""}`}>
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md border ${danger ? "bg-red-600/20 border-red-600/40" : "bg-red-600/10 border-red-600/20"}`}>
            <Icon className="w-4 h-4 text-red-400" />
          </div>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {trailing}
      </div>
      {children}
    </Card>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0 first:pt-0">
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-1">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${value ? "bg-red-600" : "bg-muted"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function SettingsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: server, isLoading } = useQuery<ServerDetails>({
    queryKey: ["server", id],
    queryFn: () => fetch(`/api/servers/${id}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: propsData, isLoading: propsLoading, isError: propsError } = useQuery<{ properties: Record<string, string> }>({
    queryKey: ["server-properties", id],
    queryFn: () => fetch(`/api/servers/${id}/properties`, { credentials: "include" }).then((r) => r.ok ? r.json() : Promise.reject(r.status)),
    retry: false,
  });

  // Connection form state
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [rconPort, setRconPort] = useState("25575");
  const [rconPassword, setRconPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [dynmapUrl, setDynmapUrl] = useState("");
  const [logPath, setLogPath] = useState("");

  // Properties form state
  const [props, setProps] = useState<Record<string, string>>({});
  const [propsDirty, setPropsDirty] = useState(false);

  useEffect(() => {
    if (!server) return;
    setName(server.name); setHost(server.host);
    setRconPort(String(server.rconPort));
    setDynmapUrl(server.dynmapUrl ?? "");
    setLogPath(server.logPath ?? "");
  }, [server]);

  useEffect(() => {
    if (propsData?.properties) {
      setProps({ ...propsData.properties });
      setPropsDirty(false);
    }
  }, [propsData]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/servers/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["server", id] }),
  });

  const savePropsMutation = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      fetch(`/api/servers/${id}/properties`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties }) }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-properties", id] });
      setPropsDirty(false);
    },
  });

  const actionMutation = useMutation({
    mutationFn: (cmd: "reload" | "stop" | "restart") =>
      fetch(`/api/servers/${id}/action/${cmd}`, { method: "POST", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      invalidateServerStatus();
    },
  });

  function invalidateServerStatus() {
    queryClient.invalidateQueries({ queryKey: ["server-status", id] });
  }

  const deleteMutation = useMutation({
    mutationFn: () => fetch(`/api/servers/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["servers"] }); void navigate({ to: "/" }); },
  });

  const [confirmAction, setConfirmAction] = useState<"stop" | "restart" | "remove" | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [propsOk, setPropsOk] = useState(false);

  function handleSaveConnection() {
    const body: Record<string, unknown> = {
      name: name || undefined,
      host: host || undefined,
      rconPort: rconPort ? Number(rconPort) : undefined,
      dynmapUrl: dynmapUrl || null,
      logPath: logPath || null,
    };
    if (rconPassword) body.rconPassword = rconPassword;
    saveMutation.mutate(body, {
      onSuccess: () => { setSaveOk(true); setRconPassword(""); setTimeout(() => setSaveOk(false), 2500); },
    });
  }

  function setProp(key: string, value: string) {
    setProps((p) => ({ ...p, [key]: value }));
    setPropsDirty(true);
  }

  function handleSaveProps() {
    // Only send keys that differ from original
    const orig = propsData?.properties ?? {};
    const changed: Record<string, string> = {};
    for (const [k, v] of Object.entries(props)) {
      if (orig[k] !== v) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) return;
    savePropsMutation.mutate(changed, {
      onSuccess: () => { setPropsOk(true); setTimeout(() => setPropsOk(false), 2500); },
    });
  }

  if (isLoading) return (
    <div className="p-4 flex items-center justify-center h-40">
      <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-red-500" />
        <h2 className="text-base font-semibold">Server Settings</h2>
      </div>

      {/* Connection settings */}
      <Section
        icon={Server}
        title="Connection"
        trailing={
          <Button
            onClick={handleSaveConnection}
            disabled={saveMutation.isPending}
            className={`h-7 text-xs gap-1.5 ${saveOk ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            <Save className="w-3 h-3" />
            {saveMutation.isPending ? "Saving…" : saveOk ? "Saved!" : "Save"}
          </Button>
        }
      >
        <Field label="Display Name" description="Name shown in the dashboard">
          <Input value={name} onChange={(e) => setName(e.target.value)}
            className="w-52 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600" />
        </Field>
        <Field label="Host" description="Hostname or IP of the Minecraft server">
          <Input value={host} onChange={(e) => setHost(e.target.value)}
            className="w-52 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 font-mono" />
        </Field>
        <Field label="RCON Port" description="Remote console port (default 25575)">
          <Input type="number" value={rconPort} onChange={(e) => setRconPort(e.target.value)}
            className="w-24 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 font-mono" />
        </Field>
        <Field label="RCON Password" description="Leave blank to keep current password">
          <div className="relative w-52">
            <Input type={showPass ? "text" : "password"} value={rconPassword}
              onChange={(e) => setRconPassword(e.target.value)}
              placeholder="••••••••"
              className="h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 pr-8"
              autoComplete="new-password" />
            <button type="button" onClick={() => setShowPass((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </Field>
      </Section>

      {/* Integrations */}
      <Section icon={Globe} title="Integrations"
        trailing={
          <Button onClick={handleSaveConnection} disabled={saveMutation.isPending}
            className={`h-7 text-xs gap-1.5 ${saveOk ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
            <Save className="w-3 h-3" />
            {saveMutation.isPending ? "Saving…" : saveOk ? "Saved!" : "Save"}
          </Button>
        }
      >
        <Field label="Dynmap URL" description="Live map URL (e.g. http://host:8123)">
          <Input value={dynmapUrl} onChange={(e) => setDynmapUrl(e.target.value)}
            placeholder="http://…"
            className="w-52 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 font-mono" />
        </Field>
        <Field label="Log File Path" description="Absolute path to latest.log (inside this container)">
          <Input value={logPath} onChange={(e) => setLogPath(e.target.value)}
            placeholder="/data/mc/logs/latest.log"
            className="w-52 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 font-mono" />
        </Field>
      </Section>

      {/* Server Properties */}
      <Section
        icon={Sliders}
        title="server.properties"
        trailing={
          propsError ? (
            <Badge variant="outline" className="text-xs border-yellow-600/40 text-yellow-400">
              Not accessible
            </Badge>
          ) : (
            <div className="flex items-center gap-2">
              {propsDirty && (
                <Badge variant="outline" className="text-xs border-orange-600/40 text-orange-400 animate-pulse">
                  Unsaved
                </Badge>
              )}
              <Button
                onClick={handleSaveProps}
                disabled={savePropsMutation.isPending || !propsDirty || propsLoading}
                className={`h-7 text-xs gap-1.5 ${propsOk ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
              >
                <Save className="w-3 h-3" />
                {savePropsMutation.isPending ? "Writing…" : propsOk ? "Written!" : "Write File"}
              </Button>
            </div>
          )
        }
      >
        {propsLoading && (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {propsError && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
            <span>server.properties not found. Make sure the MC volume is mounted and <code className="text-xs bg-muted px-1 rounded">logPath</code> is set correctly in Integrations.</span>
          </div>
        )}
        {!propsLoading && !propsError && (
          <>
            <div className="mb-2 flex items-center gap-1.5 p-2 rounded bg-orange-600/10 border border-orange-600/20">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <p className="text-[11px] text-orange-300">Most changes require a server restart to take effect.</p>
            </div>
            {PROPERTY_DEFS.map((def) => {
              const val = props[def.key] ?? "";
              if (def.type === "bool") return (
                <Field key={def.key} label={def.label} description={def.desc}>
                  <Toggle value={val === "true"} onChange={(v) => setProp(def.key, String(v))} />
                </Field>
              );
              if (def.type === "select") return (
                <Field key={def.key} label={def.label} description={def.desc}>
                  <select
                    value={val}
                    onChange={(e) => setProp(def.key, e.target.value)}
                    className="h-8 px-2 text-xs rounded-md bg-black/30 border border-red-600/30 focus:outline-none focus:ring-1 focus:ring-red-600 text-foreground capitalize"
                  >
                    {def.options.map((o) => (
                      <option key={o} value={o} className="bg-zinc-900 capitalize">{o}</option>
                    ))}
                  </select>
                </Field>
              );
              if (def.type === "number") return (
                <Field key={def.key} label={def.label} description={def.desc}>
                  <Input type="number" value={val}
                    onChange={(e) => setProp(def.key, e.target.value)}
                    className="w-24 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 font-mono" />
                </Field>
              );
              return (
                <Field key={def.key} label={def.label} description={def.desc}>
                  <Input value={val} onChange={(e) => setProp(def.key, e.target.value)}
                    className="w-52 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600" />
                </Field>
              );
            })}
          </>
        )}
      </Section>

      {/* Danger Zone */}
      <Section icon={Database} title="Danger Zone" danger>
        <Field label="Reload Plugins" description="Reload plugins without a full restart (Paper/Spigot only)">
          <Button variant="outline" size="sm"
            className="h-7 text-xs border-orange-600/40 text-orange-400 hover:bg-orange-600/10 gap-1.5"
            disabled={actionMutation.isPending}
            onClick={() => actionMutation.mutate("reload")}>
            <RotateCcw className="w-3 h-3" />
            Reload
          </Button>
        </Field>
        <Field label="Restart Server" description="Stop and let Docker restart the container (applies property changes)">
          <Button variant="outline" size="sm"
            className="h-7 text-xs border-orange-600/40 text-orange-400 hover:bg-orange-600/10 gap-1.5"
            onClick={() => setConfirmAction("restart")}>
            <RefreshCw className="w-3 h-3" />
            Restart
          </Button>
        </Field>
        <Field label="Stop Server" description="Gracefully stop the Minecraft server (without restart)">
          <Button variant="outline" size="sm"
            className="h-7 text-xs border-red-600/40 text-red-400 hover:bg-red-600/10 gap-1.5"
            onClick={() => setConfirmAction("stop")}>
            <Square className="w-3 h-3" />
            Stop
          </Button>
        </Field>
        <Field label="Remove from Dashboard" description="Remove this server record — does not stop the process">
          <Button variant="outline" size="sm"
            className="h-7 text-xs border-red-600/40 text-red-400 hover:bg-red-600/10 gap-1.5"
            onClick={() => setConfirmAction("remove")}>
            <Trash2 className="w-3 h-3" />
            Remove
          </Button>
        </Field>
      </Section>

      {/* Confirm dialogs */}
      <AlertDialog open={confirmAction === "restart"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Server?</AlertDialogTitle>
            <AlertDialogDescription>
              The server will stop and Docker will automatically restart it. All property file changes will be applied. Players will be disconnected briefly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-700"
              onClick={() => { actionMutation.mutate("restart"); setConfirmAction(null); }}>
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === "stop"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Server?</AlertDialogTitle>
            <AlertDialogDescription>
              Sends <code className="text-xs bg-muted px-1 rounded">/stop</code> via RCON. The Minecraft process will shut down and players will be disconnected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { actionMutation.mutate("stop"); setConfirmAction(null); }}>
              Stop Server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === "remove"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{server?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This server will be removed from the dashboard. The Minecraft process keeps running. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { deleteMutation.mutate(); setConfirmAction(null); }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
