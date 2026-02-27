import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Users, UserX, Shield, Search } from "lucide-react";

export const Route = createFileRoute("/_app/servers/$id/players")({
  component: PlayersPage,
});

type Filter = "all" | "online" | "offline";

function PlayersPage() {
  const { id } = Route.useParams();
  const [players, setPlayers] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [action, setAction] = useState<{ type: "kick" | "ban"; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("online");
  const [search, setSearch] = useState("");

  const { data: historyData } = useQuery({
    queryKey: ["players-history", id],
    queryFn: () =>
      fetch(`/api/servers/${id}/players/history`, { credentials: "include" })
        .then((r) => r.json()) as Promise<{ players: string[] }>,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/servers/${id}/players`);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; data?: string[] };
        if (msg.type === "players" && Array.isArray(msg.data)) setPlayers(msg.data);
      } catch {}
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [id]);

  const onlineSet = new Set(players);
  const allKnown = [...new Set([...players, ...(historyData?.players ?? [])])].sort((a, b) => a.localeCompare(b));

  const displayed = allKnown.filter((name) => {
    if (filter === "online" && !onlineSet.has(name)) return false;
    if (filter === "offline" && onlineSet.has(name)) return false;
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function executeAction() {
    if (!action) return;
    setLoading(true);
    try {
      await fetch(`/api/servers/${id}/players/${encodeURIComponent(action.name)}/${action.type}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      setPlayers((prev) => prev.filter((p) => p !== action.name));
    } finally {
      setLoading(false);
      setAction(null);
      setReason("");
    }
  }

  const filterLabels: { key: Filter; label: string }[] = [
    { key: "online", label: `Online (${players.length})` },
    { key: "offline", label: `Offline (${allKnown.filter((n) => !onlineSet.has(n)).length})` },
    { key: "all", label: `All (${allKnown.length})` },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-red-500" />
        <h1 className="text-xl font-bold">Players</h1>
        <Badge
          variant="outline"
          className={connected
            ? "border-green-600/40 text-green-400 bg-green-600/10"
            : "border-yellow-600/40 text-yellow-400 bg-yellow-600/10"}
        >
          <div className={`w-1 h-1 rounded-full mr-1 animate-pulse ${connected ? "bg-green-400" : "bg-yellow-400"}`} />
          {connected ? "Live" : "Connecting…"}
        </Badge>
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex rounded-md overflow-hidden border border-border">
          {filterLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search players…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      <Card className="border-red-600/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            {displayed.length} player{displayed.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {displayed.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {filter === "online" ? "No players currently online." : "No players found."}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <ul className="space-y-2">
                {displayed.map((name) => {
                  const isOnline = onlineSet.has(name);
                  return (
                    <li key={name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors group">
                      <Avatar className="h-9 w-9 rounded-sm">
                        <AvatarImage
                          src={`https://mc-heads.net/avatar/${name}/36`}
                          alt={name}
                          className={`rounded-sm ${!isOnline ? "opacity-50 grayscale" : ""}`}
                        />
                        <AvatarFallback className={`text-xs font-semibold rounded-sm ${isOnline ? "bg-green-600/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${isOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                        <span className={`text-sm font-medium truncate ${!isOnline ? "text-muted-foreground" : ""}`}>{name}</span>
                        {!isOnline && <span className="text-[10px] text-muted-foreground/60 shrink-0">offline</span>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {isOnline && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-orange-400 hover:bg-orange-500/10"
                            title={`Kick ${name}`}
                            onClick={() => { setAction({ type: "kick", name }); setReason(""); }}
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:bg-red-500/10"
                          title={`Ban ${name}`}
                          onClick={() => { setAction({ type: "ban", name }); setReason(""); }}
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action?.type === "kick" ? "Kick" : "Ban"} {action?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action?.type === "kick"
                ? `${action.name} will be disconnected from the server.`
                : `${action?.name} will be permanently banned and cannot rejoin.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 grid gap-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input
              id="reason"
              placeholder="No reason provided"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-black/30 border-red-600/30 focus-visible:ring-red-600"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={loading}
              className={action?.type === "ban" ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}
            >
              {loading ? "Processing…" : (action?.type === "kick" ? "Kick Player" : "Ban Player")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

