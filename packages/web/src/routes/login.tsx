import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSignIn, useSession } from "@/hooks/useSession.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Zap, Shield, Server, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const signIn = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (session?.user) {
    void navigate({ to: "/" });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signIn.mutateAsync({ email, password });
    void navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(220, 38, 38, 0.3) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(220, 38, 38, 0.3) 1px, transparent 1px)`,
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <Card className="w-full max-w-md relative z-10 border-red-600/30 bg-card/95 backdrop-blur">
        <CardHeader className="space-y-4 text-center pb-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="p-4 bg-red-600/10 rounded-2xl border border-red-600/30">
                <Zap className="w-12 h-12 text-red-600 fill-red-600" />
              </div>
              <div className="absolute inset-0 bg-red-600 blur-2xl opacity-30 animate-pulse" />
            </div>
          </div>
          <div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-red-500 via-orange-500 to-red-600 bg-clip-text text-transparent">
              redstne.dash
            </CardTitle>
            <CardDescription className="text-sm mt-2">
              Minecraft Server Management Platform
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="bg-black/30 border-red-600/30 focus-visible:ring-red-600 h-10"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="bg-black/30 border-red-600/30 focus-visible:ring-red-600 h-10"
              />
            </div>
            {signIn.error && (
              <p className="text-sm text-destructive">{signIn.error.message}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 h-10 group"
              disabled={signIn.isPending}
            >
              {signIn.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Connecting...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Access Dashboard</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </Button>
          </form>

          <div className="pt-4 border-t border-border">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-green-600/10 border border-green-600/30">
                <Server className="w-5 h-5 text-green-400 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Multi-Server</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-600/10 border border-orange-600/30">
                <Zap className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Real-time</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-600/10 border border-blue-600/30">
                <Shield className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Secure</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
