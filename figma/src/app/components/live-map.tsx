import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { MapPin, Navigation, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";

interface Player {
  id: string;
  name: string;
  x: number;
  z: number;
  color: string;
}

const mockPlayers: Player[] = [
  { id: "1", name: "Steve", x: 250, z: 180, color: "#dc2626" },
  { id: "2", name: "Alex", x: 420, z: 320, color: "#ea580c" },
  { id: "3", name: "Notch", x: 150, z: 450, color: "#f59e0b" },
  { id: "4", name: "Herobrine", x: 380, z: 220, color: "#fbbf24" },
  { id: "5", name: "Enderman", x: 200, z: 350, color: "#fb923c" },
];

export function LiveMap() {
  const [zoom, setZoom] = useState(1);
  const mapSize = 500;
  const gridSize = 50;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Live Map</h3>
          <Badge variant="secondary" className="ml-1 h-5 text-[10px]">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse mr-1" />
            Live
          </Badge>
        </div>

        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          >
            <ZoomOut className="w-3 h-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            <ZoomIn className="w-3 h-3" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7">
            <Maximize className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="relative border rounded-lg overflow-hidden bg-gradient-to-br from-green-900/20 to-blue-900/20">
        <div
          className="relative"
          style={{
            width: mapSize,
            height: mapSize,
            transform: `scale(${zoom})`,
            transformOrigin: "center",
            transition: "transform 0.3s ease",
          }}
        >
          {/* Grid */}
          <svg className="absolute inset-0 w-full h-full opacity-20">
            {Array.from({ length: mapSize / gridSize }).map((_, i) => (
              <g key={i}>
                <line
                  x1={i * gridSize}
                  y1={0}
                  x2={i * gridSize}
                  y2={mapSize}
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <line
                  x1={0}
                  y1={i * gridSize}
                  x2={mapSize}
                  y2={i * gridSize}
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </g>
            ))}
          </svg>

          {/* Terrain features (mock) */}
          <div className="absolute top-10 left-10 w-32 h-32 bg-green-600/30 rounded-full blur-xl" />
          <div className="absolute top-40 right-20 w-40 h-40 bg-blue-600/30 rounded-full blur-xl" />
          <div className="absolute bottom-20 left-32 w-36 h-36 bg-yellow-600/30 rounded-full blur-xl" />
          <div className="absolute bottom-10 right-10 w-28 h-28 bg-gray-600/30 rounded-full blur-xl" />

          {/* Center marker */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <Navigation className="w-6 h-6 text-primary" />
            <div className="absolute top-full mt-1 text-xs text-muted-foreground whitespace-nowrap">
              Spawn (0, 0)
            </div>
          </div>

          {/* Players */}
          {mockPlayers.map((player) => (
            <div
              key={player.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
              style={{
                left: player.x,
                top: player.z,
              }}
            >
              {/* Player marker */}
              <div className="relative">
                <div
                  className="w-4 h-4 rounded-full border-2 border-white shadow-lg animate-pulse"
                  style={{ backgroundColor: player.color }}
                />
                {/* Ping effect */}
                <div
                  className="absolute inset-0 w-4 h-4 rounded-full opacity-50 animate-ping"
                  style={{ backgroundColor: player.color }}
                />
              </div>

              {/* Player tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-popover text-popover-foreground border rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg">
                  <div className="font-semibold">{player.name}</div>
                  <div className="text-muted-foreground">
                    X: {player.x - 250}, Z: {player.z - 250}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2">
        {mockPlayers.map((player) => (
          <div key={player.id} className="flex items-center gap-1.5 text-xs">
            <div
              className="w-2.5 h-2.5 rounded-full border border-white"
              style={{ backgroundColor: player.color }}
            />
            <span>{player.name}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground">
        <p>Use the zoom controls to adjust view. Hover over markers for player info.</p>
      </div>
    </Card>
  );
}