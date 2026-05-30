import { useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dashboard } from "@/components/dashboard";
import { SongLab } from "@/components/song-lab";
import { LanguagesTab } from "@/components/languages-tab";
import { useLocation } from "wouter";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { useListLanguages } from "@workspace/api-client-react";

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
      <circle cx="8"  cy="8"  r="1.2" fill="url(#dice-grad)" />
      <circle cx="16" cy="8"  r="1.2" fill="url(#dice-grad)" />
      <circle cx="8"  cy="12" r="1.2" fill="url(#dice-grad)" />
      <circle cx="16" cy="12" r="1.2" fill="url(#dice-grad)" />
      <circle cx="8"  cy="16" r="1.2" fill="url(#dice-grad)" />
      <circle cx="16" cy="16" r="1.2" fill="url(#dice-grad)" />
    </svg>
  );
}

export default function Home() {
  const [tab, setTab] = useState(() => {
    try {
      const t = sessionStorage.getItem("home_return_tab");
      if (t) { sessionStorage.removeItem("home_return_tab"); return t; }
    } catch {}
    return "dashboard";
  });
  const [filteredSongIds, setFilteredSongIds] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [faceIdx, setFaceIdx] = useState(5);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setLocation] = useLocation();

  const { data: languages } = useListLanguages();

  const DiceIcon = DICE_FACES[faceIdx];

  const canRoll =
    !rolling &&
    ((tab === "dashboard" && filteredSongIds.length > 0) ||
     (tab === "languages" && !!languages && languages.length > 0));

  const handleDiceClick = () => {
    if (!canRoll) return;
    setRolling(true);
    rollIntervalRef.current = setInterval(() => {
      setFaceIdx((f) => (f + 1) % 6);
    }, 70);
    setTimeout(() => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      setRolling(false);
      setFaceIdx(5);

      if (tab === "languages" && languages && languages.length > 0) {
        const randomLang = languages[Math.floor(Math.random() * languages.length)];
        setLocation(`/flashcards/${encodeURIComponent(randomLang)}`);
      } else if (tab === "dashboard" && filteredSongIds.length > 0) {
        const randomId = filteredSongIds[Math.floor(Math.random() * filteredSongIds.length)];
        setLocation(`/song/${randomId}`);
      }
    }, 600);
  };

  const inactive = !canRoll && !rolling;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col p-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-center gap-2 mb-6">
        <h1 className="text-3xl font-bold text-center text-primary-foreground tracking-tight">WBlackjack</h1>
        <button
          onClick={handleDiceClick}
          disabled={inactive}
          className={`transition-all duration-150 rounded-lg p-1 ${
            inactive
              ? "opacity-30 cursor-default pointer-events-none"
              : rolling
              ? "text-primary"
              : "hover:bg-muted cursor-pointer"
          }`}
          aria-label={tab === "languages" ? "Random language flashcards" : "Random song"}
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
