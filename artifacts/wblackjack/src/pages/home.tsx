import { useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dashboard } from "@/components/dashboard";
import { SongLab } from "@/components/song-lab";
import { useLocation } from "wouter";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";

const DICE_FACES = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [filteredSongIds, setFilteredSongIds] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [faceIdx, setFaceIdx] = useState(0);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setLocation] = useLocation();

  const DiceIcon = DICE_FACES[faceIdx];
  const canRoll = tab === "dashboard" && filteredSongIds.length > 0 && !rolling;

  const handleDiceClick = () => {
    if (!canRoll) return;
    setRolling(true);
    rollIntervalRef.current = setInterval(() => {
      setFaceIdx((f) => (f + 1) % 6);
    }, 70);
    setTimeout(() => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      const randomId = filteredSongIds[Math.floor(Math.random() * filteredSongIds.length)];
      setRolling(false);
      setLocation(`/song/${randomId}`);
    }, 600);
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col p-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-center gap-2 mb-6">
        <h1 className="text-3xl font-bold text-center text-primary-foreground tracking-tight">WBlackjack</h1>
        <button
          onClick={handleDiceClick}
          disabled={!canRoll}
          className={`transition-all duration-150 rounded-lg p-1 ${
            tab !== "dashboard"
              ? "opacity-30 cursor-default pointer-events-none"
              : rolling
              ? "text-primary"
              : "text-muted-foreground hover:text-primary hover:bg-muted"
          }`}
          aria-label="Random song"
        >
          <DiceIcon className={`w-7 h-7 ${rolling ? "animate-spin" : ""}`} />
        </button>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1">
        <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="song-lab">Song Lab</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="flex-1 flex flex-col">
          <Dashboard onFilteredSongsChange={setFilteredSongIds} />
        </TabsContent>
        <TabsContent value="song-lab" className="flex-1 flex flex-col">
          <SongLab onSongAdded={() => setTab("dashboard")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
