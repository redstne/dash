import { useState } from "react";
import { Zap, Shield, Server, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface LoginProps {
  onLogin: (username: string, password: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      onLogin(username, password);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(220, 38, 38, 0.3) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(220, 38, 38, 0.3) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }} />
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
              redstnkit.dash
            </CardTitle>
            <CardDescription className="text-sm mt-2">
              Minecraft Server Management Platform
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-black/30 border-red-600/30 focus-visible:ring-red-600 h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-black/30 border-red-600/30 focus-visible:ring-red-600 h-10"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 h-10 group"
              disabled={isLoading}
            >
              {isLoading ? (
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

          <div className="text-center text-xs text-muted-foreground">
            <p>Demo credentials: any username/password</p>
          </div>
        </CardContent>
      </Card>

      {/* Floating particles effect */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-red-500/30 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
