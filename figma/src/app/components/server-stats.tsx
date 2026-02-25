import { Card } from "./ui/card";
import { Activity, Users, Zap, HardDrive } from "lucide-react";

interface ServerStatsProps {
  status: "online" | "offline";
  players: number;
  maxPlayers: number;
  tps: number;
  memory: { used: number; total: number };
}

export function ServerStats({ status, players, maxPlayers, tps, memory }: ServerStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
      <Card className="p-3 bg-gradient-to-br from-green-950/50 to-green-900/30 border-green-600/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-500/20 rounded-md border border-green-600/30">
            <Activity className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-base font-semibold text-green-400 capitalize">{status}</p>
          </div>
        </div>
      </Card>

      <Card className="p-3 bg-gradient-to-br from-blue-950/50 to-blue-900/30 border-blue-600/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/20 rounded-md border border-blue-600/30">
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Players</p>
            <p className="text-base font-semibold text-blue-400">{players} / {maxPlayers}</p>
          </div>
        </div>
      </Card>

      <Card className="p-3 bg-gradient-to-br from-orange-950/50 to-orange-900/30 border-orange-600/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-orange-500/20 rounded-md border border-orange-600/30">
            <Zap className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">TPS</p>
            <p className="text-base font-semibold text-orange-400">{tps}</p>
          </div>
        </div>
      </Card>

      <Card className="p-3 bg-gradient-to-br from-red-950/50 to-red-900/30 border-red-600/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-500/20 rounded-md border border-red-600/30">
            <HardDrive className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Memory</p>
            <p className="text-base font-semibold text-red-400">{memory.used} / {memory.total} GB</p>
          </div>
        </div>
      </Card>
    </div>
  );
}