import { Card } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Sword, Shield, Crown, Ban, UserCog } from "lucide-react";
import { Button } from "./ui/button";

interface Player {
  id: string;
  name: string;
  role: "owner" | "admin" | "moderator" | "player";
  status: "online" | "offline";
  ping: number;
  playtime: string;
  kills: number;
  deaths: number;
}

const mockPlayers: Player[] = [
  { id: "1", name: "Steve", role: "owner", status: "online", ping: 23, playtime: "245h 32m", kills: 1247, deaths: 89 },
  { id: "2", name: "Alex", role: "admin", status: "online", ping: 45, playtime: "198h 15m", kills: 892, deaths: 123 },
  { id: "3", name: "Notch", role: "admin", status: "online", ping: 67, playtime: "512h 48m", kills: 2103, deaths: 67 },
  { id: "4", name: "Herobrine", role: "moderator", status: "online", ping: 34, playtime: "89h 22m", kills: 445, deaths: 234 },
  { id: "5", name: "Enderman", role: "player", status: "online", ping: 56, playtime: "45h 11m", kills: 234, deaths: 156 },
  { id: "6", name: "Creeper", role: "player", status: "online", ping: 78, playtime: "67h 33m", kills: 178, deaths: 189 },
  { id: "7", name: "Zombie", role: "player", status: "online", ping: 92, playtime: "34h 44m", kills: 123, deaths: 267 },
  { id: "8", name: "Skeleton", role: "player", status: "online", ping: 41, playtime: "56h 12m", kills: 289, deaths: 201 },
  { id: "9", name: "Spider", role: "player", status: "offline", ping: 0, playtime: "23h 45m", kills: 145, deaths: 178 },
  { id: "10", name: "Witch", role: "player", status: "offline", ping: 0, playtime: "78h 23m", kills: 367, deaths: 234 },
];

const roleIcons = {
  owner: <Crown className="w-3 h-3" />,
  admin: <Shield className="w-3 h-3" />,
  moderator: <Sword className="w-3 h-3" />,
  player: null,
};

const roleColors = {
  owner: "bg-yellow-500/10 text-yellow-400 border-yellow-600/30",
  admin: "bg-red-500/10 text-red-400 border-red-600/30",
  moderator: "bg-orange-500/10 text-orange-400 border-orange-600/30",
  player: "bg-gray-500/10 text-gray-400 border-gray-600/30",
};

export function Members() {
  const onlinePlayers = mockPlayers.filter((p) => p.status === "online");
  const offlinePlayers = mockPlayers.filter((p) => p.status === "offline");

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Server Members</h3>
          <p className="text-xs text-muted-foreground">
            {onlinePlayers.length} online • {offlinePlayers.length} offline
          </p>
        </div>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Online</h4>
            <div className="space-y-2">
              {onlinePlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-green-500/10 text-green-500 text-xs">
                      {player.name[0]}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">{player.name}</p>
                      <Badge variant="outline" className={`${roleColors[player.role]} text-[10px] h-4 px-1.5`}>
                        {roleIcons[player.role]}
                        <span className="ml-0.5">{player.role}</span>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span>{player.ping}ms</span>
                      <span>•</span>
                      <span>{player.playtime}</span>
                      <span>•</span>
                      <span>K/D: {player.kills}/{player.deaths}</span>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <UserCog className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500">
                      <Ban className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {offlinePlayers.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Offline</h4>
              <div className="space-y-2">
                {offlinePlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-2 p-2 rounded-lg border bg-card opacity-50"
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-gray-500/10 text-gray-500 text-xs">
                        {player.name[0]}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{player.name}</p>
                        <Badge variant="outline" className={`${roleColors[player.role]} text-[10px] h-4 px-1.5`}>
                          {roleIcons[player.role]}
                          <span className="ml-0.5">{player.role}</span>
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{player.playtime}</span>
                        <span>•</span>
                        <span>K/D: {player.kills}/{player.deaths}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}