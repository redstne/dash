import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings, Save, Server, Globe, Database,
  RotateCcw, Square, Trash2, Eye, EyeOff, RefreshCw,
  Sliders, AlertTriangle, Gamepad2, Globe2, Cpu, Shield, ChevronDown, ChevronUp,
  Bold, Italic, Underline, Strikethrough, RotateCcw as Reset, Wifi, WifiHigh, WifiLow,
  Download, CheckCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { useState, useEffect, useRef, useCallback } from "react";
import { Slider } from "@/components/ui/slider.tsx";
import { cn } from "@/lib/utils.ts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";


interface ServerDetails {
  id: string; name: string; host: string; rconPort: number;
  dynmapUrl: string | null; logPath: string | null; enabled: boolean;
}

// ── Minecraft color/format codes ──────────────────────────────────────────

const MC_COLORS: Record<string, string> = {
  "0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA",
  "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA",
  "8": "#555555", "9": "#5555FF", "a": "#55FF55", "b": "#55FFFF",
  "c": "#FF5555", "d": "#FF55FF", "e": "#FFFF55", "f": "#FFFFFF",
};

const COLOR_PALETTE = [
  { code: "f", label: "White" },
  { code: "7", label: "Gray" },
  { code: "8", label: "Dark Gray" },
  { code: "0", label: "Black" },
  { code: "c", label: "Red" },
  { code: "4", label: "Dark Red" },
  { code: "e", label: "Yellow" },
  { code: "6", label: "Gold" },
  { code: "a", label: "Green" },
  { code: "2", label: "Dark Green" },
  { code: "b", label: "Aqua" },
  { code: "3", label: "Dark Aqua" },
  { code: "9", label: "Blue" },
  { code: "1", label: "Dark Blue" },
  { code: "d", label: "Light Purple" },
  { code: "5", label: "Dark Purple" },
] as const;

// Parse §-codes into styled segments
function parseMC(value: string) {
  const parts: { text: string; color: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean }[] = [];
  let cur = { text: "", color: "#AAAAAA", bold: false, italic: false, underline: false, strike: false };
  let i = 0;
  while (i < value.length) {
    if ((value[i] === "§" || value[i] === "&") && i + 1 < value.length) {
      if (cur.text) { parts.push({ ...cur }); cur = { ...cur, text: "" }; }
      const c = value[i + 1]!.toLowerCase();
      if (MC_COLORS[c]) cur = { text: "", color: MC_COLORS[c]!, bold: false, italic: false, underline: false, strike: false };
      else if (c === "l") cur = { ...cur, text: "", bold: true };
      else if (c === "o") cur = { ...cur, text: "", italic: true };
      else if (c === "n") cur = { ...cur, text: "", underline: true };
      else if (c === "m") cur = { ...cur, text: "", strike: true };
      else if (c === "r") cur = { text: "", color: "#AAAAAA", bold: false, italic: false, underline: false, strike: false };
      i += 2;
    } else if (value[i] === "\n") {
      if (cur.text) { parts.push({ ...cur }); cur = { ...cur, text: "" }; }
      parts.push({ ...cur, text: "\n" });
      i++;
    } else {
      cur.text += value[i];
      i++;
    }
  }
  if (cur.text) parts.push({ ...cur });
  return parts;
}

function MotdLine({ value }: { value: string }) {
  const parts = parseMC(value);
  return (
    <>
      {parts.map((p, i) =>
        p.text === "\n" ? null : (
          <span key={i} style={{
            color: p.color,
            fontWeight: p.bold ? "bold" : undefined,
            fontStyle: p.italic ? "italic" : undefined,
            textDecoration: [p.underline && "underline", p.strike && "line-through"].filter(Boolean).join(" ") || undefined,
          }}>{p.text}</span>
        )
      )}
    </>
  );
}

// Full Minecraft server-list style preview
function ServerListPreview({ motd, serverName, serverId }: { motd: string; serverName: string; serverId: string }) {
  const lines = motd.split("\n");
  const line1 = lines[0] ?? "";
  const line2 = lines[1] ?? "";

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3 select-none">
      <div className="flex items-start gap-3">
        {/* Server icon */}
        <div className="w-12 h-12 rounded bg-[#2a2a2a] border border-[#3a3a3a] shrink-0 flex items-center justify-center overflow-hidden">
          <img
            src={`/api/servers/${serverId}/icon`}
            alt="server icon"
            className="w-full h-full object-cover"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
              el.parentElement!.innerHTML = '<span class="text-xl">⛏️</span>';
            }}
          />
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0 space-y-0.5">
          {/* Server name + ping */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white truncate">{serverName || "Minecraft Server"}</span>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <span className="text-[10px] text-[#AAAAAA] font-mono">42ms</span>
              <div className="flex flex-col gap-[1px] items-end">
                {[4,3,2,1].map((b) => (
                  <div key={b} style={{ height: 2 * b, width: 3 }} className={cn("rounded-sm", b <= 4 ? "bg-[#55FF55]" : "bg-[#555555]")} />
                ))}
              </div>
            </div>
          </div>
          {/* MOTD lines */}
          <div className="font-mono text-[13px] leading-[1.35] min-h-[2rem]" style={{ fontFamily: "Minecraft, monospace, sans-serif" }}>
            <div><MotdLine value={line1} /></div>
            {(line2 || motd.includes("\n")) && <div><MotdLine value={line2} /></div>}
          </div>
          {/* Player count */}
          <div className="text-[11px] text-[#AAAAAA]">0/20 players</div>
        </div>
      </div>
    </div>
  );
}

// MOTD rich editor
function MotdEditor({ value, onChange, serverName, serverId }: { value: string; onChange: (v: string) => void; serverName: string; serverId: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAt = useCallback((insert: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insert.length, start + insert.length);
    });
  }, [value, onChange]);

  const charCount = value.replace(/§./g, "").replace(/&./g, "").length;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Colors */}
        <div className="flex flex-wrap gap-1">
          {COLOR_PALETTE.map(({ code, label }) => (
            <button
              key={code}
              title={`${label} (§${code})`}
              onClick={() => insertAt(`§${code}`)}
              className="w-5 h-5 rounded border border-white/10 hover:scale-110 transition-transform shrink-0"
              style={{ backgroundColor: MC_COLORS[code] }}
            />
          ))}
        </div>
        {/* Divider */}
        <div className="w-px h-5 bg-border" />
        {/* Formats */}
        {[
          { code: "l", icon: Bold,          title: "Bold (§l)" },
          { code: "o", icon: Italic,        title: "Italic (§o)" },
          { code: "n", icon: Underline,     title: "Underline (§n)" },
          { code: "m", icon: Strikethrough, title: "Strikethrough (§m)" },
        ].map(({ code, icon: Icon, title }) => (
          <button
            key={code}
            title={title}
            onClick={() => insertAt(`§${code}`)}
            className="w-6 h-6 rounded border border-border hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
        {/* Reset */}
        <button
          title="Reset (§r)"
          onClick={() => insertAt("§r")}
          className="h-6 px-1.5 rounded border border-border hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          §r
        </button>
        {/* Newline */}
        <button
          title="New line (line 2 of MOTD)"
          onClick={() => insertAt("\n")}
          className="h-6 px-1.5 rounded border border-border hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          ↵ line 2
        </button>
        <span className={cn("ml-auto text-[10px] font-mono", charCount > 59 ? "text-yellow-400" : "text-muted-foreground")}>
          {charCount}/59
        </span>
      </div>

      {/* Raw input */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="A Minecraft Server"
        rows={2}
        className="w-full resize-none rounded-md border border-red-600/30 bg-black/30 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-red-600 text-foreground placeholder:text-muted-foreground"
      />

      {/* Server list preview */}
      <ServerListPreview motd={value} serverName={serverName} serverId={serverId} />
    </div>
  );
}

// ── Property definitions by category ─────────────────────────────────────

type PropDef =
  | { key: string; label: string; desc: string; type: "text" }
  | { key: string; label: string; desc: string; type: "number"; min?: number; max?: number }
  | { key: string; label: string; desc: string; type: "slider"; min: number; max: number; step?: number; unit?: string }
  | { key: string; label: string; desc: string; type: "bool" }
  | { key: string; label: string; desc: string; type: "select"; options: readonly string[] }
  | { key: string; label: string; desc: string; type: "motd" };

interface PropCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  props: PropDef[];
}

const PROP_CATEGORIES: PropCategory[] = [
  {
    id: "general",
    label: "General",
    icon: Server,
    props: [
      { key: "motd",        label: "MOTD",        type: "motd", desc: "Message shown in the server browser. Supports §color codes (§c = red, §l = bold, §r = reset)." },
      { key: "server-port", label: "Server Port",  type: "number", min: 1, max: 65535, desc: "Port the server listens on (default 25565)" },
      { key: "max-players", label: "Max Players",  type: "number", min: 1, max: 1000, desc: "Maximum concurrent connections" },
      { key: "level-name",  label: "World Name",   type: "text", desc: "Name of the world folder" },
      { key: "level-seed",  label: "Level Seed",   type: "text", desc: "Seed used to generate the world (empty = random)" },
    ],
  },
  {
    id: "gameplay",
    label: "Gameplay",
    icon: Gamepad2,
    props: [
      { key: "difficulty",    label: "Difficulty",       type: "select", options: ["peaceful","easy","normal","hard"], desc: "World difficulty" },
      { key: "gamemode",      label: "Default Gamemode", type: "select", options: ["survival","creative","adventure","spectator"], desc: "Starting gamemode for new players" },
      { key: "force-gamemode",label: "Force Gamemode",   type: "bool",   desc: "Force players to default gamemode on join" },
      { key: "pvp",           label: "PvP",              type: "bool",   desc: "Allow player vs player combat" },
      { key: "hardcore",      label: "Hardcore",         type: "bool",   desc: "Permanent death ban on hardcore mode" },
      { key: "spawn-protection", label: "Spawn Protection", type: "slider", min: 0, max: 64, unit: "blocks", desc: "Radius around spawn protected from non-ops (0 = off)" },
      { key: "enable-command-block", label: "Command Blocks", type: "bool", desc: "Allow command block execution" },
      { key: "allow-flight",  label: "Allow Flight",     type: "bool",   desc: "Allow flying (required for some plugins/gamemodes)" },
    ],
  },
  {
    id: "world",
    label: "World",
    icon: Globe2,
    props: [
      { key: "generate-structures", label: "Generate Structures", type: "bool", desc: "Generate villages, strongholds, etc." },
      { key: "spawn-monsters",  label: "Spawn Monsters", type: "bool", desc: "Allow hostile mob spawning" },
      { key: "spawn-animals",   label: "Spawn Animals",  type: "bool", desc: "Allow passive mob spawning" },
      { key: "spawn-npcs",      label: "Spawn NPCs",     type: "bool", desc: "Allow villager spawning" },
      { key: "allow-nether",    label: "Allow Nether",   type: "bool", desc: "Enable the nether dimension" },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    icon: Cpu,
    props: [
      { key: "view-distance",       label: "View Distance",       type: "slider", min: 2, max: 32, unit: "chunks", desc: "Chunks sent to each player — higher uses more CPU/RAM" },
      { key: "simulation-distance", label: "Simulation Distance", type: "slider", min: 2, max: 32, unit: "chunks", desc: "Ticking radius — lower improves performance" },
      { key: "max-tick-time",       label: "Max Tick Time",       type: "number", min: -1, max: 60000, desc: "Watchdog timeout in ms (-1 = disable)" },
      { key: "network-compression-threshold", label: "Compression Threshold", type: "number", min: -1, max: 65536, desc: "Compress packets larger than N bytes (-1 = off, 0 = all)" },
    ],
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    props: [
      { key: "online-mode",       label: "Online Mode",       type: "bool",   desc: "Authenticate players with Mojang (disable for proxy networks)" },
      { key: "white-list",        label: "Whitelist",         type: "bool",   desc: "Restrict join to whitelisted players" },
      { key: "enforce-whitelist", label: "Enforce Whitelist", type: "bool",   desc: "Kick non-whitelisted players on /whitelist reload" },
      { key: "op-permission-level", label: "Op Permission Level", type: "select", options: ["1","2","3","4"], desc: "1=bypass spawn, 2=commands, 3=player cmds, 4=RCON" },
      { key: "resource-pack",     label: "Resource Pack URL", type: "text",   desc: "URL to a resource pack players will be prompted to install" },
      { key: "require-resource-pack", label: "Require Resource Pack", type: "bool", desc: "Kick players who decline the resource pack" },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────

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

function Field({ label, description, children, wide }: { label: string; description?: string; children: React.ReactNode; wide?: boolean }) {
  if (wide) return (
    <div className="py-3 border-b border-border last:border-0 space-y-2">
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0 first:pt-0">
      <div className="min-w-0">
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

function PropField({ def, value, onChange, serverName, serverId }: { def: PropDef; value: string; onChange: (v: string) => void; serverName: string; serverId: string }) {
  if (def.type === "motd") return (
    <div className="py-3 border-b border-border last:border-0 space-y-2">
      <div>
        <p className="text-sm font-medium leading-none">{def.label}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{def.desc}</p>
      </div>
      <MotdEditor value={value} onChange={onChange} serverName={serverName} serverId={serverId} />
    </div>
  );

  if (def.type === "bool") return (
    <Field label={def.label} description={def.desc}>
      <Toggle value={value === "true"} onChange={(v) => onChange(String(v))} />
    </Field>
  );

  if (def.type === "select") return (
    <Field label={def.label} description={def.desc}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-xs rounded-md bg-black/30 border border-red-600/30 focus:outline-none focus:ring-1 focus:ring-red-600 text-foreground capitalize"
      >
        {def.options.map((o) => (
          <option key={o} value={o} className="bg-zinc-900 capitalize">{o}</option>
        ))}
      </select>
    </Field>
  );

  if (def.type === "slider") {
    const num = Number(value) || def.min;
    return (
      <Field label={def.label} description={def.desc} wide>
        <div className="flex items-center gap-3">
          <Slider
            min={def.min} max={def.max} step={def.step ?? 1}
            value={[num]}
            onValueChange={(vals: number[]) => onChange(String(vals[0]))}
            className="flex-1"
          />
          <span className="text-xs font-mono text-primary w-20 text-right shrink-0">
            {num} {def.unit}
          </span>
        </div>
      </Field>
    );
  }

  if (def.type === "number") return (
    <Field label={def.label} description={def.desc}>
      <Input type="number" value={value}
        min={"min" in def ? def.min : undefined}
        max={"max" in def ? def.max : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 font-mono" />
    </Field>
  );

  return (
    <Field label={def.label} description={def.desc}>
      <Input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-52 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600" />
    </Field>
  );
}

function PropCategory({ category, props, onChange, serverName, serverId }: {
  category: PropCategory;
  props: Record<string, string>;
  onChange: (key: string, value: string) => void;
  serverName: string;
  serverId: string;
}) {
  const [open, setOpen] = useState(true);
  const Icon = category.icon;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">{category.label}</span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 py-1">
          {category.props.map((def) => (
            <PropField
              key={def.key}
              def={def}
              value={props[def.key] ?? ""}
              onChange={(v) => onChange(def.key, v)}
              serverName={serverName}
              serverId={serverId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Software Switcher ─────────────────────────────────────────────────────

type RuntimeType = "vanilla" | "paper" | "purpur" | "fabric" | "forge";

const RUNTIME_META: Record<RuntimeType, { label: string; colorClass: string; description: string }> = {
  vanilla: { label: "Vanilla",  colorClass: "text-green-400",  description: "Official Mojang server" },
  paper:   { label: "Paper",    colorClass: "text-blue-400",   description: "High-performance Spigot fork" },
  purpur:  { label: "Purpur",   colorClass: "text-purple-400", description: "Paper fork with extras" },
  fabric:  { label: "Fabric",   colorClass: "text-yellow-400", description: "Lightweight mod loader" },
  forge:   { label: "Forge",    colorClass: "text-orange-400", description: "Minecraft Forge mod loader" },
};

interface VersionsResponse {
  mcVersions?: string[];
  builds?: Array<{ id: string | number; stable: boolean; downloadUrl?: string; filename?: string }>;
  loaders?: string[];
  installers?: string[];
}

function buildDownloadInfo(
  runtime: RuntimeType, mcVersion: string,
  buildId?: string, loaderVersion?: string, installerVersion?: string,
): { url: string; filename: string } | null {
  switch (runtime) {
    case "paper": {
      if (!buildId) return null;
      return {
        url: `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${buildId}/downloads/paper-${mcVersion}-${buildId}.jar`,
        filename: `paper-${mcVersion}-${buildId}.jar`,
      };
    }
    case "purpur":
      if (!buildId) return null;
      return {
        url: `https://api.purpurmc.org/v2/purpur/${mcVersion}/${buildId}/download`,
        filename: `purpur-${mcVersion}-${buildId}.jar`,
      };
    case "fabric":
      if (!loaderVersion || !installerVersion) return null;
      return {
        url: `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/${installerVersion}/server/jar`,
        filename: `fabric-server-mc.${mcVersion}-loader.${loaderVersion}-launcher.${installerVersion}.jar`,
      };
    case "forge":
      if (!buildId) return null;
      return {
        url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${buildId}/forge-${buildId}-installer.jar`,
        filename: `forge-${buildId}-installer.jar`,
      };
    case "vanilla":
      return null;
  }
}

function SoftwareSwitcher({ serverId }: { serverId: string }) {
  const [runtime, setRuntime] = useState<RuntimeType>("paper");
  const [mcVersion, setMcVersion] = useState("");
  const [buildId, setBuildId] = useState("");
  const [loaderVersion, setLoaderVersion] = useState("");
  const [installerVersion, setInstallerVersion] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [installed, setInstalled] = useState<string | null>(null);

  const { data: current, isLoading: currentLoading, refetch: refetchCurrent } = useQuery<{
    filename: string | null; runtime: string | null; version: string | null;
  }>({
    queryKey: ["runtime-current", serverId],
    queryFn: () => fetch(`/api/servers/${serverId}/runtime/current`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

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
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => { if (!r.ok) return r.text().then((t) => Promise.reject(new Error(t))); return r.json(); }),
    onSuccess: (_data, vars) => {
      setInstalled(vars.filename);
      setConfirmOpen(false);
      void refetchCurrent();
    },
  });

  function getDownloadInfo(): { url: string; filename: string } | null {
    if (runtime === "vanilla") {
      const b = buildsData?.builds?.find((b) => String(b.id) === mcVersion);
      if (!b?.downloadUrl || !b?.filename) return null;
      return { url: b.downloadUrl, filename: b.filename };
    }
    return buildDownloadInfo(runtime, mcVersion, buildId || undefined, loaderVersion || undefined, installerVersion || undefined);
  }

  const dlInfo = getDownloadInfo();

  const meta = RUNTIME_META[runtime];
  const currentMeta = current?.runtime ? RUNTIME_META[current.runtime as RuntimeType] : null;

  return (
    <div className="space-y-4">
      {/* Current runtime display */}
      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/50">
        <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground">Currently installed</p>
          {currentLoading ? (
            <Skeleton className="h-4 w-40 mt-0.5" />
          ) : current?.filename ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-mono font-medium truncate">{current.filename}</span>
              {currentMeta && (
                <Badge variant="outline" className={cn("text-[10px] h-4 border-current shrink-0", currentMeta.colorClass)}>
                  {currentMeta.label}
                </Badge>
              )}
              {current.version && (
                <Badge variant="secondary" className="text-[10px] h-4 shrink-0">{current.version}</Badge>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">No JAR detected</span>
          )}
        </div>
        <button onClick={() => void refetchCurrent()} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Runtime selector */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Server software</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(RUNTIME_META) as RuntimeType[]).map((r) => (
            <button
              key={r}
              onClick={() => { setRuntime(r); setMcVersion(""); setBuildId(""); setLoaderVersion(""); setInstallerVersion(""); setInstalled(null); }}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border transition-all",
                runtime === r
                  ? cn("border-current bg-current/10", RUNTIME_META[r].colorClass)
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
              )}
            >
              {RUNTIME_META[r].label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{meta.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* MC Version */}
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Minecraft version</p>
          {loadingMc ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select value={mcVersion} onValueChange={(v) => { setMcVersion(v); setBuildId(""); setLoaderVersion(""); setInstallerVersion(""); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select version…" />
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

        {/* Build / Loader */}
        {runtime === "fabric" ? (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Loader version</p>
            {loadingBuilds || !mcVersion ? (
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
        ) : runtime !== "vanilla" ? (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">{runtime === "forge" ? "Forge version" : "Build"}</p>
            {loadingBuilds || !mcVersion ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <Select value={buildId} onValueChange={setBuildId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select build…" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-48">
                    {(buildsData?.builds ?? []).map((b) => (
                      <SelectItem key={String(b.id)} value={String(b.id)} className="text-xs">
                        {String(b.id)}{b.stable ? " ★" : ""}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            )}
          </div>
        ) : null}
      </div>

      {/* Fabric installer picker */}
      {runtime === "fabric" && mcVersion && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Installer version</p>
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
      )}

      {/* Forge warning */}
      {runtime === "forge" && (
        <p className="text-[11px] text-amber-400/80 flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Forge downloads an installer JAR — run it manually on the server after download.
        </p>
      )}

      {/* Filename preview */}
      {dlInfo && (
        <div className="p-2 rounded-md bg-muted/30 border text-[11px] font-mono text-muted-foreground break-all">
          {dlInfo.filename}
        </div>
      )}

      {/* Success message */}
      {installed && (
        <div className="flex items-center gap-2 text-green-400 text-xs">
          <CheckCircle className="w-4 h-4" />
          {installed} installed — restart the server to apply.
        </div>
      )}

      <Button
        className="h-8 text-xs gap-1.5 bg-red-600 hover:bg-red-700"
        disabled={!dlInfo || installMut.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {installMut.isPending
          ? <><Cpu className="w-3.5 h-3.5 animate-spin" /> Downloading…</>
          : <><Download className="w-3.5 h-3.5" /> Install {meta.label} {mcVersion || "…"}</>}
      </Button>

      {installMut.isError && (
        <p className="text-xs text-red-400">{String((installMut.error as Error)?.message ?? "Install failed")}</p>
      )}

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

// ── Main Page ─────────────────────────────────────────────────────────────

export function ServerSettings({ serverId }: { serverId: string }) {
  const id = serverId;
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

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [rconPort, setRconPort] = useState("25575");
  const [rconPassword, setRconPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [dynmapUrl, setDynmapUrl] = useState("");
  const [logPath, setLogPath] = useState("");
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
      queryClient.invalidateQueries({ queryKey: ["server-status", id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => fetch(`/api/servers/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["servers"] }); void navigate({ to: "/" }); },
  });

  const [confirmAction, setConfirmAction] = useState<"stop" | "restart" | "remove" | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [propsOk, setPropsOk] = useState(false);
  const [iconError, setIconError] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const [iconMsg, setIconMsg] = useState<string | null>(null);
  const [iconKey, setIconKey] = useState(0);
  const iconInputRef = useRef<HTMLInputElement>(null);

  async function handleIconUpload(file: File) {
    setIconUploading(true);
    setIconMsg(null);
    try {
      const res = await fetch(`/api/servers/${id}/icon`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "image/png" },
        body: file,
      });
      if (res.ok) {
        setIconMsg("Icon updated!");
        setIconError(false);
        setIconKey((k) => k + 1);
      } else {
        setIconMsg(`Error: ${res.status}`);
      }
    } catch {
      setIconMsg("Upload failed");
    } finally {
      setIconUploading(false);
      setTimeout(() => setIconMsg(null), 3000);
    }
  }

  const statusPageUrl = typeof window !== "undefined" ? `${window.location.origin}/status/${id}` : `/status/${id}`;
  const [copyOk, setCopyOk] = useState(false);

  function handleSaveConnection() {
    const body: Record<string, unknown> = {
      name: name || undefined, host: host || undefined,
      rconPort: rconPort ? Number(rconPort) : undefined,
      dynmapUrl: dynmapUrl || null, logPath: logPath || null,
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
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-red-500" />
        <h2 className="text-base font-semibold">Server Settings</h2>
      </div>

      {/* Connection */}
      <Section icon={Server} title="Connection"
        trailing={
          <Button onClick={handleSaveConnection} disabled={saveMutation.isPending}
            className={`h-7 text-xs gap-1.5 ${saveOk ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
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
              onChange={(e) => setRconPassword(e.target.value)} placeholder="••••••••"
              className="h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 pr-8"
              autoComplete="new-password" />
            <button type="button" onClick={() => setShowPass((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </Field>
        <Field label="Server Icon" description="PNG, 64×64px recommended">
          <div className="flex items-center gap-3">
            {!iconError ? (
              <img
                key={iconKey}
                src={`/api/servers/${id}/icon`}
                alt="Server icon"
                className="w-16 h-16 rounded border border-border object-cover bg-muted"
                onError={() => setIconError(true)}
              />
            ) : (
              <div className="w-16 h-16 rounded border border-border bg-muted flex items-center justify-center text-muted-foreground text-xl">⛏️</div>
            )}
            <div className="flex flex-col gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs"
                disabled={iconUploading}
                onClick={() => iconInputRef.current?.click()}>
                {iconUploading ? "Uploading…" : "Upload Icon"}
              </Button>
              {iconMsg && <p className="text-xs text-muted-foreground">{iconMsg}</p>}
            </div>
            <input ref={iconInputRef} type="file" accept="image/png" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleIconUpload(f); e.target.value = ""; }} />
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
          <Input value={dynmapUrl} onChange={(e) => setDynmapUrl(e.target.value)} placeholder="http://…"
            className="w-52 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 font-mono" />
        </Field>
        <Field label="Log File Path" description="Absolute path to latest.log (inside this container)">
          <Input value={logPath} onChange={(e) => setLogPath(e.target.value)} placeholder="/data/mc/logs/latest.log"
            className="w-52 h-8 text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 font-mono" />
        </Field>
        <Field label="Status Page" description="Share this link for a public server status view">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">{statusPageUrl}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
              onClick={() => { void navigator.clipboard.writeText(statusPageUrl); setCopyOk(true); setTimeout(() => setCopyOk(false), 2000); }}>
              {copyOk ? "Copied!" : "Copy"}
            </Button>
          </div>
        </Field>
      </Section>

      {/* Software */}
      <Section icon={Cpu} title="Software">
        <SoftwareSwitcher serverId={id} />
      </Section>

      {/* server.properties */}
      <Section icon={Sliders} title="server.properties"
        trailing={
          propsError ? (
            <Badge variant="outline" className="text-xs border-yellow-600/40 text-yellow-400">Not accessible</Badge>
          ) : (
            <div className="flex items-center gap-2">
              {propsDirty && (
                <Badge variant="outline" className="text-xs border-orange-600/40 text-orange-400 animate-pulse">Unsaved</Badge>
              )}
              <Button onClick={handleSaveProps}
                disabled={savePropsMutation.isPending || !propsDirty || propsLoading}
                className={`h-7 text-xs gap-1.5 ${propsOk ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
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
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 p-2 rounded bg-orange-600/10 border border-orange-600/20">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <p className="text-[11px] text-orange-300">Most changes require a server restart to take effect.</p>
            </div>
            {PROP_CATEGORIES.map((cat) => (
              <PropCategory key={cat.id} category={cat} props={props} onChange={setProp} serverName={name} serverId={id} />
            ))}
          </div>
        )}
      </Section>

      {/* Danger Zone */}
      <Section icon={Database} title="Danger Zone" danger>
        <Field label="Reload Plugins" description="Reload plugins without a full restart (Paper/Spigot only)">
          <Button variant="outline" size="sm"
            className="h-7 text-xs border-orange-600/40 text-orange-400 hover:bg-orange-600/10 gap-1.5"
            disabled={actionMutation.isPending}
            onClick={() => actionMutation.mutate("reload")}>
            <RotateCcw className="w-3 h-3" />Reload
          </Button>
        </Field>
        <Field label="Restart Server" description="Stop and let Docker restart the container (applies property changes)">
          <Button variant="outline" size="sm"
            className="h-7 text-xs border-orange-600/40 text-orange-400 hover:bg-orange-600/10 gap-1.5"
            onClick={() => setConfirmAction("restart")}>
            <RefreshCw className="w-3 h-3" />Restart
          </Button>
        </Field>
        <Field label="Stop Server" description="Gracefully stop the Minecraft server (without restart)">
          <Button variant="outline" size="sm"
            className="h-7 text-xs border-red-600/40 text-red-400 hover:bg-red-600/10 gap-1.5"
            onClick={() => setConfirmAction("stop")}>
            <Square className="w-3 h-3" />Stop
          </Button>
        </Field>
        <Field label="Remove from Dashboard" description="Remove this server record — does not stop the process">
          <Button variant="outline" size="sm"
            className="h-7 text-xs border-red-600/40 text-red-400 hover:bg-red-600/10 gap-1.5"
            onClick={() => setConfirmAction("remove")}>
            <Trash2 className="w-3 h-3" />Remove
          </Button>
        </Field>
      </Section>

      <AlertDialog open={confirmAction === "restart"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Server?</AlertDialogTitle>
            <AlertDialogDescription>Players will be disconnected briefly. Property changes will be applied.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-700"
              onClick={() => { actionMutation.mutate("restart"); setConfirmAction(null); }}>Restart</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === "stop"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Server?</AlertDialogTitle>
            <AlertDialogDescription>Sends <code className="text-xs bg-muted px-1 rounded">/stop</code> via RCON. Players will be disconnected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { actionMutation.mutate("stop"); setConfirmAction(null); }}>Stop Server</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === "remove"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{server?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Removed from the dashboard only. The Minecraft process keeps running.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { deleteMutation.mutate(); setConfirmAction(null); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
