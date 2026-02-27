import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  FileText, RefreshCw, Download, Search, Wifi, WifiOff, ChevronRight,
  Archive, FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/_app/servers/$id/logs")({
  component: LogsPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface LogFile {
  name: string;
  size: number;
  mtime: string | null;
  compressed: boolean;
  isLatest: boolean;
}

type LogLevel = "ALL" | "INFO" | "WARN" | "ERROR";

// ── Helpers ───────────────────────────────────────────────────────────────────
function classifyLine(line: string): { level: LogLevel; cls: string } {
  if (/\[ERROR\]|ERROR|Exception|Caused by:/i.test(line))
    return { level: "ERROR", cls: "text-red-400" };
  if (/\[WARN\]|WARN|Warning/i.test(line))
    return { level: "WARN", cls: "text-yellow-400" };
  if (/joined the game|left the game/i.test(line))
    return { level: "INFO", cls: "text-green-400" };
  if (/Starting|Stopping|Done|loaded/i.test(line))
    return { level: "INFO", cls: "text-blue-400" };
  return { level: "INFO", cls: "text-muted-foreground" };
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

// ── Log line component ────────────────────────────────────────────────────────
function LogLine({ line, filter }: { line: string; filter: string }) {
  const { cls } = classifyLine(line);
  if (filter && !line.toLowerCase().includes(filter.toLowerCase())) return null;
  return (
    <div className={cn("font-mono text-[11px] leading-5 px-3 py-0.5 whitespace-pre-wrap break-all hover:bg-white/5 transition-colors", cls)}>
      {line}
    </div>
  );
}

// ── Live tail component ───────────────────────────────────────────────────────
function LiveTail({ id, filter, level }: { id: string; filter: string; level: LogLevel }) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/servers/${id}/logs/tail`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; lines?: string[]; data?: string };
        if (msg.type === "history" && msg.lines) {
          setLines(msg.lines);
        } else if (msg.type === "line" && msg.data) {
          setLines((prev) => [...prev.slice(-4999), msg.data!]);
        }
      } catch { /* ignore */ }
    };

    return () => { ws.close(); };
  }, [id]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, autoScroll]);

  const visibleLines = lines.filter((line) => {
    if (filter && !line.toLowerCase().includes(filter.toLowerCase())) return false;
    if (level !== "ALL") {
      const { level: l } = classifyLine(line);
      if (level === "ERROR" && l !== "ERROR") return false;
      if (level === "WARN" && l !== "WARN" && l !== "ERROR") return false;
    }
    return true;
  });

  function downloadLogs() {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `latest-${id}.log`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Badge
          variant="outline"
          className={connected
            ? "border-green-600/40 text-green-400 bg-green-600/10 text-[10px]"
            : "border-red-600/40 text-red-400 bg-red-600/10 text-[10px]"}
        >
          {connected ? <Wifi className="w-2.5 h-2.5 mr-1" /> : <WifiOff className="w-2.5 h-2.5 mr-1" />}
          {connected ? "Live" : "Offline"}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">{visibleLines.length} lines</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAutoScroll((v) => !v)}
          title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}>
          <ChevronRight className={cn("w-3 h-3 transition-transform", autoScroll ? "rotate-90 text-green-400" : "")} />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={downloadLogs} title="Download">
          <Download className="w-3 h-3" />
        </Button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-black/60 min-h-0"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAutoScroll(el.scrollTop + el.clientHeight >= el.scrollHeight - 32);
        }}
      >
        {visibleLines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            {connected ? "Waiting for log output…" : "Connecting…"}
          </div>
        ) : (
          visibleLines.map((line, i) => <LogLine key={i} line={line} filter="" />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Historical log viewer ─────────────────────────────────────────────────────
function HistoryViewer({ id, file, filter, level }: { id: string; file: string; filter: string; level: LogLevel }) {
  const { data, isLoading, refetch } = useQuery<{ lines: string[]; truncated: boolean }>({
    queryKey: ["log-content", id, file],
    queryFn: () =>
      fetch(`/api/servers/${id}/logs/content?file=${encodeURIComponent(file)}&tail=5000`, { credentials: "include" })
        .then((r) => r.json()),
    staleTime: 60_000,
  });

  const visibleLines = (data?.lines ?? []).filter((line) => {
    if (filter && !line.toLowerCase().includes(filter.toLowerCase())) return false;
    if (level !== "ALL") {
      const { level: l } = classifyLine(line);
      if (level === "ERROR" && l !== "ERROR") return false;
      if (level === "WARN" && l !== "WARN" && l !== "ERROR") return false;
    }
    return true;
  });

  function download() {
    const blob = new Blob([(data?.lines ?? []).join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = file; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        {data?.truncated && (
          <Badge variant="outline" className="text-[10px] text-orange-400 border-orange-500/30">Last 5000 lines</Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{visibleLines.length} lines</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void refetch()} title="Reload">
          <RefreshCw className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={download} title="Download">
          <Download className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto bg-black/60 min-h-0">
        {isLoading ? (
          <div className="p-4 space-y-1">
            {Array.from({ length: 20 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        ) : visibleLines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No matching lines.</div>
        ) : (
          visibleLines.map((line, i) => <LogLine key={i} line={line} filter="" />)
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function LogsPage() {
  const { id } = Route.useParams();
  const [selectedFile, setSelectedFile] = useState<string>("latest.log");
  const [filter, setFilter] = useState("");
  const [level, setLevel] = useState<LogLevel>("ALL");

  const { data: fileList, isLoading: filesLoading, refetch: refetchFiles } = useQuery<{ files: LogFile[] }>({
    queryKey: ["log-files", id],
    queryFn: () =>
      fetch(`/api/servers/${id}/logs`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const files = fileList?.files ?? [];
  const isLatest = selectedFile === "latest.log";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar: file list */}
      <div className="w-52 shrink-0 border-r border-border flex flex-col bg-muted/10">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Log Files</span>
          <Button variant="ghost" size="icon" className="ml-auto h-5 w-5" onClick={() => void refetchFiles()}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {filesLoading ? (
            <div className="p-2 space-y-1">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : files.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No log files found.</div>
          ) : (
            <div className="p-1 space-y-0.5">
              {files.map((f) => (
                <button
                  key={f.name}
                  onClick={() => setSelectedFile(f.name)}
                  className={cn(
                    "w-full text-left rounded px-2 py-1.5 text-xs transition-colors flex flex-col gap-0.5",
                    selectedFile === f.name
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {f.isLatest ? (
                      <FileCode className="w-3 h-3 text-green-400 shrink-0" />
                    ) : (
                      <Archive className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                    )}
                    <span className="font-medium truncate flex-1">{f.name}</span>
                    {f.isLatest && (
                      <span className="text-[9px] bg-green-500/20 text-green-400 px-1 rounded">live</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 pl-4">
                    {fmtSize(f.size)}{f.mtime ? ` · ${fmtDate(f.mtime)}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: log viewer */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-semibold truncate max-w-48">{selectedFile}</span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {(["ALL", "INFO", "WARN", "ERROR"] as LogLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded transition-colors",
                  level === l
                    ? l === "ALL" ? "bg-primary/20 text-primary"
                      : l === "ERROR" ? "bg-red-500/20 text-red-400"
                      : l === "WARN" ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-blue-500/20 text-blue-400"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-60 ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-6 text-xs pl-6 bg-black/20 border-border"
            />
          </div>
        </div>

        {/* Log content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isLatest ? (
            <LiveTail id={id} filter={filter} level={level} />
          ) : (
            <HistoryViewer id={id} file={selectedFile} filter={filter} level={level} />
          )}
        </div>
      </div>
    </div>
  );
}
