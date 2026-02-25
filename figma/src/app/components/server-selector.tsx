import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Server, Trash2, Settings } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";

export interface MinecraftServer {
  id: string;
  name: string;
  host: string;
  port: number;
  status: "online" | "offline";
  players: number;
  maxPlayers: number;
  version: string;
}

interface ServerSelectorProps {
  servers: MinecraftServer[];
  currentServer: MinecraftServer | null;
  onServerChange: (server: MinecraftServer | null) => void;
  onServerCreate: (server: Omit<MinecraftServer, "id" | "status" | "players">) => void;
  onServerDelete: (serverId: string) => void;
}

export function ServerSelector({
  servers,
  currentServer,
  onServerChange,
  onServerCreate,
  onServerDelete,
}: ServerSelectorProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newServer, setNewServer] = useState({
    name: "",
    host: "",
    port: 25565,
    maxPlayers: 50,
    version: "1.20.4",
  });

  const handleCreateServer = () => {
    if (newServer.name && newServer.host) {
      onServerCreate(newServer);
      setNewServer({
        name: "",
        host: "",
        port: 25565,
        maxPlayers: 50,
        version: "1.20.4",
      });
      setDialogOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[280px] justify-between bg-card/50 border-red-600/30 hover:bg-card"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Server className="w-4 h-4 text-red-500 shrink-0" />
              {currentServer ? (
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-sm font-medium truncate">{currentServer.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {currentServer.host}:{currentServer.port}
                  </span>
                </div>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">Select a server...</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[280px]" align="start">
          <DropdownMenuLabel>Your Servers</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {servers.length > 0 ? (
            servers.map((server) => (
              <DropdownMenuItem
                key={server.id}
                onSelect={() => {
                  onServerChange(server);
                  setOpen(false);
                }}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2 flex-1 overflow-hidden">
                  <Check
                    className={`h-4 w-4 shrink-0 ${
                      currentServer?.id === server.id ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium truncate">{server.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {server.host}:{server.port}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={server.status === "online" ? "default" : "secondary"}
                    className={`text-xs ${
                      server.status === "online"
                        ? "bg-green-600/20 text-green-400 border-green-600/30"
                        : "bg-gray-600/20 text-gray-400 border-gray-600/30"
                    }`}
                  >
                    {server.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onServerDelete(server.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No servers yet. Create your first server below.
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setDialogOpen(true);
              setOpen(false);
            }}
            className="cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>Add New Server</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Server</DialogTitle>
            <DialogDescription>
              Add a new Minecraft server to your dashboard. Enter the server details below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Server Name</Label>
              <Input
                id="name"
                placeholder="My Minecraft Server"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="host">Host / IP Address</Label>
              <Input
                id="host"
                placeholder="server.example.com"
                value={newServer.host}
                onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  placeholder="25565"
                  value={newServer.port}
                  onChange={(e) =>
                    setNewServer({ ...newServer, port: parseInt(e.target.value) || 25565 })
                  }
                  className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxPlayers">Max Players</Label>
                <Input
                  id="maxPlayers"
                  type="number"
                  placeholder="50"
                  value={newServer.maxPlayers}
                  onChange={(e) =>
                    setNewServer({ ...newServer, maxPlayers: parseInt(e.target.value) || 50 })
                  }
                  className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="version">Minecraft Version</Label>
              <Input
                id="version"
                placeholder="1.20.4"
                value={newServer.version}
                onChange={(e) => setNewServer({ ...newServer, version: e.target.value })}
                className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateServer}
              disabled={!newServer.name || !newServer.host}
              className="bg-red-600 hover:bg-red-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}