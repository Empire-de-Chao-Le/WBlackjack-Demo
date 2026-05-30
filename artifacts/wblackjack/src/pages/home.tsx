import { useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dashboard } from "@/components/dashboard";
import { SongLab } from "@/components/song-lab";
import { LanguagesTab } from "@/components/languages-tab";
import { useLocation } from "wouter";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";

const DICE_FACES = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

function GradientDice6({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="dice-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
      </defs>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" stroke="url(#dice-grad)" />
      <path d="M16 8h.01" stroke="url(#dice-grad)" />
      <path d="M8 8h.01" stroke="url(#dice-grad)" />
      <path d="M16 12h.01" stroke="url(#dice-grad)" />
      <path d="M8 12h.01" stroke="url(#dice-grad)" />
      <path d="M16 16h.01" stroke="url(#dice-grad)" />
      <path d="M8 16h.01" stroke="url(#dice-grad)" />
    </svg>
  );
}

export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [filteredSongIds, setFilteredSongIds] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [faceIdx, setFaceIdx] = useState(5);
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
      setFaceIdx(5);
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
              : "hover:bg-muted"
          }`}
          aria-label="Random song"
        >
          {rolling ? (
            <DiceIcon className="w-7 h-7 animate-spin" />
          ) : (
            <GradientDice6 size={28} />
          )}
        </button>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1">
        <TabsList className="grid w-full grid-cols-3 mb-4 bg-muted">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="song-lab">Song Lab</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="flex-1 flex flex-col">
          <Dashboard onFilteredSongsChange={setFilteredSongIds} />
        </TabsContent>
        <TabsContent value="languages" className="flex-1 flex flex-col">
          <LanguagesTab />
        </TabsContent>
        <TabsContent value="song-lab" className="flex-1 flex flex-col">
          <SongLab onSongAdded={() => setTab("dashboard")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
