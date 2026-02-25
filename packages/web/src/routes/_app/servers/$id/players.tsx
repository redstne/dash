import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Users, UserX, Shield } from "lucide-react";

export const Route = createFileRoute("/_app/servers/$id/players")({
  component: PlayersPage,
});

function PlayersPage() {
  const { id } = Route.useParams();
  const [players, setPlayers] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [action, setAction] = useState<{ type: "kick" | "ban"; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

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
      // Optimistically remove the player on kick/ban
      setPlayers((prev) => prev.filter((p) => p !== action.name));
    } finally {
      setLoading(false);
      setAction(null);
      setReason("");
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-red-500" />
        <h1 className="text-xl font-bold">Online Players</h1>
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

      <Card className="border-red-600/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            {players.length} player{players.length !== 1 ? "s" : ""} online
          </CardTitle>
        </CardHeader>
        <CardContent>
          {players.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No players currently online.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <ul className="space-y-2">
                {players.map((name) => (
                  <li key={name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors group">
                    <Avatar className="h-9 w-9 rounded-sm">
                      <AvatarImage
                        src={`https://mc-heads.net/avatar/${name}/36`}
                        alt={name}
                        className="rounded-sm"
                      />
                      <AvatarFallback className="bg-green-600/20 text-green-400 text-xs font-semibold rounded-sm">
                        {name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                      <span className="text-sm font-medium truncate">{name}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-orange-400 hover:bg-orange-500/10"
                        title={`Kick ${name}`}
                        onClick={() => { setAction({ type: "kick", name }); setReason(""); }}
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </Button>
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
                ))}
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
