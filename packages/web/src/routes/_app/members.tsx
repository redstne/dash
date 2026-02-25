import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Users, Trash2, UserPlus, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});

interface Member {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
}

const ROLE_BADGE_CLASSES = {
  admin: "border-red-600/40 text-red-400 bg-red-600/10",
  operator: "border-yellow-600/40 text-yellow-400 bg-yellow-600/10",
  viewer: "border-blue-600/40 text-blue-400 bg-blue-600/10",
};

const ROLE_LABELS = { admin: "Admin", operator: "Operator", viewer: "Viewer" };

interface InviteForm { name: string; email: string; password: string; role: Member["role"] }

function InviteDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InviteForm>({ name: "", email: "", password: "", role: "viewer" });
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: async (data: InviteForm) => {
      const res = await fetch("/api/members", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      onCreated();
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "viewer" });
      setError("");
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-red-600 hover:bg-red-700">
          <UserPlus className="h-4 w-4" /> Create user
        </Button>
      </DialogTrigger>
      <DialogContent className="border-red-600/30">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Input
            placeholder="Full name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="border-red-600/20"
          />
          <Input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="border-red-600/20"
          />
          <Input
            type="password"
            placeholder="Password (min 12 chars)"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            className="border-red-600/20"
          />
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as Member["role"] }))}
            className="w-full text-sm border border-red-600/20 rounded-md px-3 py-2 bg-input-background text-foreground"
          >
            <option value="viewer">Viewer</option>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          <Button
            className="w-full bg-red-600 hover:bg-red-700"
            disabled={create.isPending}
            onClick={() => create.mutate(form)}
          >
            {create.isPending ? "Creating…" : "Create user"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const reset = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/members/${member.id}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }
    },
    onSuccess: () => setDone(true),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="border-red-600/30">
        <DialogHeader>
          <DialogTitle>Reset password — {member.name}</DialogTitle>
        </DialogHeader>
        {done ? (
          <p className="text-sm text-green-400">Password updated.</p>
        ) : (
          <div className="space-y-3">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Input
              type="password"
              placeholder="New password (min 12 chars)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="border-red-600/20"
            />
            <Button
              className="w-full bg-red-600 hover:bg-red-700"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
            >
              {reset.isPending ? "Saving…" : "Set password"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MembersPage() {
  const qc = useQueryClient();
  const [resetTarget, setResetTarget] = useState<Member | null>(null);

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["members"],
    queryFn: async () => {
      const res = await fetch("/api/members", { credentials: "include" });
      return res.json() as Promise<Member[]>;
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Member["role"] }) => {
      await fetch(`/api/members/${id}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/members/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  return (
    <div className="p-6 space-y-4">
      {resetTarget && (
        <ResetPasswordDialog member={resetTarget} onClose={() => setResetTarget(null)} />
      )}

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-red-500" />
            <h1 className="text-2xl font-bold">Dashboard Members</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Manage access to the dashboard</p>
        </div>
        <InviteDialog onCreated={() => qc.invalidateQueries({ queryKey: ["members"] })} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <Card key={m.id} className="border-red-600/20">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-red-600/20 text-red-400 text-sm font-semibold">
                      {m.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={ROLE_BADGE_CLASSES[m.role]}>
                    {ROLE_LABELS[m.role]}
                  </Badge>
                  <select
                    value={m.role}
                    onChange={(e) =>
                      changeRole.mutate({ id: m.id, role: e.target.value as Member["role"] })
                    }
                    className="text-xs border border-red-600/20 rounded px-2 py-1 bg-input-background text-foreground"
                  >
                    {(["viewer", "operator", "admin"] as const).map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-accent"
                    title="Reset password"
                    onClick={() => setResetTarget(m)}
                  >
                    <KeyRound className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete user"
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {members.length === 0 && (
            <div className="rounded-xl border border-dashed border-red-600/20 bg-card p-12 text-center">
              <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No members yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
