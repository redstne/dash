
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ExternalLink, MapPin, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";


export function ServerMap({ serverId }: { serverId: string }) {
  const id = serverId;
  const [zoom, setZoom] = useState(1);

  const { data: server } = useQuery({
    queryKey: ["servers", id],
    queryFn: async () => {
      const res = await fetch(`/api/servers`, { credentials: "include" });
      const servers = await res.json() as Array<{ id: string; dynmapUrl?: string; name: string }>;
      return servers.find((s) => s.id === id);
    },
  });

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <Card className="flex-1 border-red-600/20 flex flex-col">
        <CardHeader className="pb-3 flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-500" />
            <CardTitle className="text-base font-semibold">
              Live Map{server?.name ? ` — ${server.name}` : ""}
            </CardTitle>
            <Badge
              variant="outline"
              className="border-red-600/40 text-red-400 bg-red-600/10"
            >
              <div className="w-1 h-1 rounded-full mr-1 bg-red-400 animate-pulse" />
              Live
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-red-600/20 rounded-md overflow-hidden">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-none border-r border-red-600/20"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              >
                <ZoomOut className="w-3 h-3" />
              </Button>
              <span className="text-xs px-2 text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-none border-l border-red-600/20"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              >
                <ZoomIn className="w-3 h-3" />
              </Button>
            </div>
            {server?.dynmapUrl && (
              <Button variant="outline" size="sm" className="h-7 text-xs border-red-600/20" asChild>
                <a href={server.dynmapUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open
                </a>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 pb-4">
          {server?.dynmapUrl ? (
            <div className="h-full rounded-lg overflow-hidden border border-red-600/20">
              <iframe
                src={server.dynmapUrl}
                className="w-full h-full"
                style={{ minHeight: "500px", transform: `scale(${zoom})`, transformOrigin: "top left", width: `${100 / zoom}%`, height: `${100 / zoom}%` }}
                title="Dynmap"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          ) : (
            <div className="h-full rounded-lg border border-red-600/20 bg-black/30 relative overflow-hidden flex flex-col items-center justify-center" style={{ minHeight: "400px" }}>
              {/* SVG grid terrain fallback */}
              <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(220,38,38,0.4)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                <circle cx="50%" cy="50%" r="60" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.3)" strokeWidth="1" />
                <circle cx="30%" cy="40%" r="40" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />
                <circle cx="70%" cy="60%" r="50" fill="rgba(220,38,38,0.1)" stroke="rgba(220,38,38,0.3)" strokeWidth="1" />
              </svg>
              <div className="relative z-10 text-center">
                <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-sm">
                  No Dynmap URL configured for this server.
                </p>
                <p className="text-muted-foreground/60 text-xs mt-1">
                  Add a Dynmap URL in server settings to enable the live map.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
