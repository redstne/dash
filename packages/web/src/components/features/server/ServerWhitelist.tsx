
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Shield, ShieldOff, ShieldCheck, Plus, Trash2, RefreshCw, Search, UserX, Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";


interface WhitelistData {
  enabled: boolean;
  players: string[];
}

export function ServerWhitelist({ serverId }: { serverId: string }) {
  const id = serverId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [addName, setAddName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<WhitelistData>({
    queryKey: ["whitelist", id],
    queryFn: () => fetch(`/api/servers/${id}/whitelist`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) =>
      fetch(`/api/servers/${id}/whitelist/toggle`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["whitelist", id] }),
  });

  const addMut = useMutation({
    mutationFn: (player: string) =>
      fetch(`/api/servers/${id}/whitelist`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player }) }),
    onSuccess: () => { setAddName(""); void queryClient.invalidateQueries({ queryKey: ["whitelist", id] }); },
  });

  const removeMut = useMutation({
    mutationFn: (player: string) =>
      fetch(`/api/servers/${id}/whitelist/${encodeURIComponent(player)}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { setRemoveTarget(null); void queryClient.invalidateQueries({ queryKey: ["whitelist", id] }); },
  });

  const enabled = data?.enabled ?? false;
  const players = (data?.players ?? []).filter((p) => !search || p.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 space-y-4">
      {/* Status card */}
      <Card className={`p-3 bg-gradient-to-br ${enabled ? "from-green-950/50 to-green-900/30 border-green-600/30" : "from-gray-950/50 to-gray-900/30 border-gray-600/30"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md border ${enabled ? "bg-green-500/20 border-green-600/30" : "bg-gray-500/20 border-gray-600/30"}`}>
              {enabled ? <ShieldCheck className="w-4 h-4 text-green-400" /> : <ShieldOff className="w-4 h-4 text-gray-400" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Whitelist status</p>
              {isLoading
                ? <Skeleton className="h-5 w-16 mt-0.5" />
                : <p className="text-sm font-semibold">{enabled ? "Enabled — only whitelisted players can join" : "Disabled — all players can join"}</p>
              }
            </div>
          </div>
          <Button
            variant={enabled ? "destructive" : "default"}
            size="sm"
            className="h-8 text-xs"
            disabled={isLoading || toggleMut.isPending}
            onClick={() => toggleMut.mutate(!enabled)}
          >
            {toggleMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : enabled ? <><ShieldOff className="w-3.5 h-3.5 mr-1.5" />Disable</> : <><Shield className="w-3.5 h-3.5 mr-1.5" />Enable</>}
          </Button>
        </div>
      </Card>

      {/* Player list */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Whitelisted Players</h3>
            {!isLoading && <Badge variant="secondary" className="text-[10px] h-4">{data?.players.length ?? 0}</Badge>}
          </div>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Add player */}
        <div className="flex gap-2 mb-3">
          <Input
            placeholder="Player name…"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className="h-8 text-xs flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && addName.trim()) addMut.mutate(addName.trim()); }}
          />
          <Button size="sm" className="h-8 text-xs" disabled={!addName.trim() || addMut.isPending} onClick={() => addMut.mutate(addName.trim())}>
            {addMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1" />Add</>}
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Filter players…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs bg-muted/30" />
        </div>

        <ScrollArea className="h-[360px]">
          <div className="space-y-1 pr-1">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)
              : players.length === 0
                ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <UserX className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">{search ? `No player matching "${search}"` : "Whitelist is empty"}</p>
                  </div>
                )
                : players.map((player) => (
                  <div key={player} className="flex items-center justify-between px-3 py-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{player[0]?.toUpperCase()}</div>
                      <span className="text-sm font-medium">{player}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => setRemoveTarget(player)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
          </div>
        </ScrollArea>
      </Card>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from whitelist?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{removeTarget}</span> will no longer be able to join if the whitelist is enabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/80" onClick={() => removeTarget && removeMut.mutate(removeTarget)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
