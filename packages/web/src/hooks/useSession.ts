import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const AUTH_BASE = "/api/auth";

async function fetchSession() {
  const res = await fetch(`${AUTH_BASE}/get-session`, { credentials: "include" });
  if (!res.ok) return null;
  return res.json() as Promise<{ user: { id: string; name: string; email: string; role: string } } | null>;
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 60_000,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await fetch(`${AUTH_BASE}/sign-in/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? "Sign-in failed");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}

export function useSetup() {
  return useQuery({
    queryKey: ["setup"],
    queryFn: async () => {
      const res = await fetch("/api/setup");
      return res.json() as Promise<{ needsSetup: boolean }>;
    },
    staleTime: Infinity,
  });
}

export function useRegisterAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Registration failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["setup"] });
      qc.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch(`${AUTH_BASE}/sign-out`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => qc.clear(),
  });
}
