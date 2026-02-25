import { useState, useRef, useEffect } from "react";
import { Card } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Send, Download } from "lucide-react";

interface LogEntry {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

const mockLogs: LogEntry[] = [
  { id: 1, timestamp: "14:23:45", level: "info", message: "[Server] Starting Minecraft server version 1.20.4" },
  { id: 2, timestamp: "14:23:46", level: "info", message: "[Server] Loading properties" },
  { id: 3, timestamp: "14:23:47", level: "success", message: "[Server] Done! Server started successfully" },
  { id: 4, timestamp: "14:24:12", level: "info", message: "[Player] Steve joined the game" },
  { id: 5, timestamp: "14:24:18", level: "info", message: "[Player] Alex joined the game" },
  { id: 6, timestamp: "14:25:03", level: "warn", message: "[Server] Can't keep up! Is the server overloaded?" },
  { id: 7, timestamp: "14:25:45", level: "info", message: "[Player] Notch joined the game" },
  { id: 8, timestamp: "14:26:12", level: "info", message: "[Chat] <Steve> Hey everyone!" },
  { id: 9, timestamp: "14:26:34", level: "info", message: "[Chat] <Alex> Hi Steve!" },
  { id: 10, timestamp: "14:27:01", level: "info", message: "[Player] Herobrine joined the game" },
  { id: 11, timestamp: "14:28:15", level: "success", message: "[Backup] World backup completed successfully" },
  { id: 12, timestamp: "14:29:22", level: "info", message: "[Chat] <Notch> Building time!" },
];

const levelColors = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  success: "text-green-400",
};

export function Console() {
  const [logs, setLogs] = useState<LogEntry[]>(mockLogs);
  const [command, setCommand] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Simulate live logs
    const interval = setInterval(() => {
      const newLog: LogEntry = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        level: "info",
        message: `[Server] Automatic save complete`,
      };
      setLogs((prev) => [...prev, newLog]);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSendCommand = () => {
    if (!command.trim()) return;

    const newLog: LogEntry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
      level: "success",
      message: `> ${command}`,
    };
    setLogs((prev) => [...prev, newLog]);
    setCommand("");
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Server Console</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <Download className="w-3 h-3 mr-1.5" />
          Export Logs
        </Button>
      </div>

      <ScrollArea className="h-[400px] rounded-md border bg-black/50 p-3 font-mono text-xs">
        <div ref={scrollRef} className="space-y-1">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2">
              <span className="text-gray-500">[{log.timestamp}]</span>
              <span className={levelColors[log.level]}>{log.message}</span>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex gap-2 mt-3">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendCommand()}
          placeholder="Enter server command..."
          className="font-mono text-xs bg-black/30 border-red-600/30 focus-visible:ring-red-600 h-8"
        />
        <Button onClick={handleSendCommand} size="icon" className="bg-red-600 hover:bg-red-700 h-8 w-8">
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </Card>
  );
}