
import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Send, Download, Terminal as TerminalIcon } from "lucide-react";


export function ServerConsole({ serverId }: { serverId: string }) {
  const id = serverId;
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [command, setCommand] = useState("");
  const [connected, setConnected] = useState(false);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);

  function connect(term: Terminal) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/servers/${id}/console`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Don't mark as connected yet — wait for the "connected" message which
      // includes whether the Minecraft server is actually reachable via RCON.
      term.writeln("\r\n\x1b[90mEstablishing console session…\x1b[0m");
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; data?: string; online?: boolean };
        if (msg.type === "connected") {
          setConnected(true);
          if (msg.online) {
            term.writeln("\x1b[32m✓ Connected to server console\x1b[0m\r\n");
          } else {
            term.writeln("\x1b[33m⚠ Dashboard connected — Minecraft server is offline (RCON unreachable)\x1b[0m\r\n");
          }
        } else if (msg.type === "output" && msg.data) {
          term.writeln(msg.data.replace(/\r?\n/g, "\r\n"));
        } else if (msg.type === "error") {
          term.writeln(`\x1b[31m[error] ${msg.data ?? ""}\x1b[0m`);
        }
      } catch {}
    };
    ws.onclose = () => {
      setConnected(false);
      term.writeln("\r\n\x1b[33m⚠ Disconnected — reconnecting in 5s…\x1b[0m");
      reconnectTimerRef.current = setTimeout(() => connect(term), 5_000);
    };
    ws.onerror = () => term.writeln("\r\n\x1b[31m✗ Connection error\x1b[0m");
  }

  useEffect(() => {
    if (!termRef.current) return;
    const term = new Terminal({
      theme: {
        background: "#0a0a0a",
        foreground: "#c9d1d9",
        cursor: "#dc2626",
        selectionBackground: "#dc262640",
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(termRef.current);
    fit.fit();
    terminalRef.current = term;

    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(termRef.current);

    connect(term);

    return () => {
      resizeObserver.disconnect();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      term.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sendCommand = useCallback(() => {
    const cmd = command.trim();
    if (!cmd || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    historyRef.current = [cmd, ...historyRef.current.slice(0, 49)];
    historyIdxRef.current = -1;
    wsRef.current.send(JSON.stringify({ command: cmd }));
    setCommand("");
  }, [command]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = historyIdxRef.current + 1;
      if (next < historyRef.current.length) {
        historyIdxRef.current = next;
        setCommand(historyRef.current[next] ?? "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const prev = historyIdxRef.current - 1;
      if (prev < 0) {
        historyIdxRef.current = -1;
        setCommand("");
      } else {
        historyIdxRef.current = prev;
        setCommand(historyRef.current[prev] ?? "");
      }
    }
  }

  return (
    <div className="flex flex-col flex-1 p-3 gap-3 overflow-hidden min-h-0">
      {/* Header bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-red-500" />
          <h1 className="text-sm font-semibold">Server Console</h1>
          <Badge
            variant="outline"
            className={connected
              ? "border-green-600/40 text-green-400 bg-green-600/10"
              : "border-red-600/40 text-red-400 bg-red-600/10"}
          >
            <div className={`w-1 h-1 rounded-full mr-1 animate-pulse ${connected ? "bg-green-400" : "bg-red-400"}`} />
            {connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-red-600/20 hover:border-red-600/40"
          onClick={() => {
            const content = terminalRef.current?.buffer.active;
            if (!content) return;
            const lines: string[] = [];
            for (let i = 0; i < content.length; i++) {
              lines.push(content.getLine(i)?.translateToString() ?? "");
            }
            const blob = new Blob([lines.join("\n")], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `console-${id}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="w-3 h-3 mr-1" />
          Export Logs
        </Button>
      </div>

      {/* Terminal — fills all remaining space */}
      <div
        ref={termRef}
        className="flex-1 rounded-md overflow-hidden border border-red-600/20 bg-[#0a0a0a] min-h-0"
      />

      {/* Command input */}
      <form
        className="flex gap-2 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          sendCommand();
        }}
      >
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600 font-mono text-xs select-none">&gt;</span>
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command… (↑↓ for history)"
            className="font-mono text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 pl-7"
            disabled={!connected}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          className="bg-red-600 hover:bg-red-700 shrink-0"
          disabled={!connected || !command.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
