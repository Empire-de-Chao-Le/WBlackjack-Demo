import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  useCreateSong,
  useUpsertLyrics,
  useSaveTimestamps,
  getListSongsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

declare global {
  interface Window {
    YT: {
      Player: new (
        id: string,
        opts: object
      ) => {
        getCurrentTime: () => number;
        playVideo: () => void;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

type LyricLineInput = {
  lineIndex: number;
  original: string;
  translation: string;
  distractor1: string;
  distractor2: string;
  distractor3: string;
  distractor4: string;
};

interface Props {
  artist: string;
  title: string;
  youtubeUrl: string;
  language: string;
  lines: LyricLineInput[];
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
  return match ? match[1] : url;
}

export function SyncTool({ artist, title, youtubeUrl, language, lines }: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const playerRef = useRef<{ getCurrentTime: () => number; playVideo: () => void } | null>(null);

  // currentIdx = index of the UPCOMING line to be stamped on the next tap.
  // The bright/middle line is lines[currentIdx - 1] (already stamped & currently playing).
  // At start (currentIdx=0) no line has been stamped → show "···" in the middle slot.
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timestamps, setTimestamps] = useState<
    { lineIndex: number; timestampMs: number }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);

  const createSong = useCreateSong();
  const upsertLyrics = useUpsertLyrics();
  const saveTimestamps = useSaveTimestamps();

  useEffect(() => {
    const existingScript = document.getElementById("yt-sync-script");
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }
    if (!existingScript) {
      const tag = document.createElement("script");
      tag.id = "yt-sync-script";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = initPlayer;
  }, []);

  function initPlayer() {
    if (!window.YT) return;
    playerRef.current = new window.YT.Player("yt-sync-player", {
      videoId: extractVideoId(youtubeUrl),
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
      events: {
        onReady: (e: { target: { playVideo: () => void } }) => e.target.playVideo(),
      },
    });
  }

  const save = async (finalTimestamps: { lineIndex: number; timestampMs: number }[]) => {
    setIsSaving(true);
    try {
      const song = await createSong.mutateAsync({
        data: { artist, title, youtubeUrl, language },
      });
      await upsertLyrics.mutateAsync({ id: song.id, data: { lines } });
      await saveTimestamps.mutateAsync({
        id: song.id,
        data: { timestamps: finalTimestamps },
      });
      queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
      setLocation("/");
    } catch (e) {
      console.error(e);
      setIsSaving(false);
    }
  };

  const handleTap = () => {
    const currentMs =
      playerRef.current?.getCurrentTime
        ? playerRef.current.getCurrentTime() * 1000
        : 0;

    // Stamp the UPCOMING line (currentIdx), then advance so the next one becomes upcoming
    const newTimestamps = [
      ...timestamps,
      { lineIndex: currentIdx, timestampMs: currentMs },
    ];
    setTimestamps(newTimestamps);
    const nextIdx = currentIdx + 1;
    setCurrentIdx(nextIdx);

    if (nextIdx >= lines.length) {
      save(newTimestamps);
    }
  };

  const isDone = currentIdx >= lines.length;

  // Display slots:
  // pastLine    = lines[currentIdx - 2]  (far past, dull)
  // middleLine  = lines[currentIdx - 1]  (currently playing, bright) — or "···" at start
  // upcomingLine = lines[currentIdx]     (next to tap, slightly dim)
  // upcoming2   = lines[currentIdx + 1]  (further ahead, dim)
  const pastLine    = lines[currentIdx - 2]?.original ?? null;
  const middleLine  = currentIdx > 0 ? (lines[currentIdx - 1]?.original ?? null) : null;
  const upcomingLine  = lines[currentIdx]?.original ?? null;
  const upcoming2Line = lines[currentIdx + 1]?.original ?? null;

  return (
    <div className="flex flex-col h-full absolute inset-0 bg-background z-50 p-4 pb-safe max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-3 shrink-0">
        <h2 className="font-bold text-base">Sync Tool</h2>
        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-medium">
          {currentIdx} / {lines.length} tapped
        </span>
      </div>

      {/* YouTube player — 70% width */}
      <div className="w-[70%] mx-auto bg-black rounded-xl overflow-hidden mb-4 shrink-0 shadow-xl">
        <div className="aspect-video">
          <div id="yt-sync-player" className="w-full h-full" />
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-2 space-y-3 overflow-hidden min-h-0">
        {/* Past (far) */}
        {pastLine && (
          <p className="text-xl text-muted-foreground/50 text-center truncate">
            {pastLine}
          </p>
        )}

        {/* Middle — bright currently-playing line, or dots before first tap */}
        {middleLine ? (
          <p
            className="text-xl font-bold text-foreground text-center leading-snug"
            style={{ textShadow: "0 0 24px rgba(200,150,255,0.4)" }}
          >
            {middleLine}
          </p>
        ) : (
          <p className="text-xl text-muted-foreground/40 text-center tracking-widest animate-pulse select-none">
            ···
          </p>
        )}

        {/* Upcoming — slightly dim, this is what the next tap will stamp */}
        {upcomingLine && !isDone && (
          <p className="text-xl text-muted-foreground/50 text-center truncate">
            {upcomingLine}
          </p>
        )}

        {/* Far upcoming */}
        {upcoming2Line && !isDone && (
          <p className="text-xl text-muted-foreground/35 text-center truncate">
            {upcoming2Line}
          </p>
        )}
      </div>

      <div className="mt-4 shrink-0">
        {!isDone ? (
          <Button
            size="lg"
            className="w-full h-14 text-2xl font-bold bg-primary hover:bg-primary/90 active:scale-[0.97] transition-transform"
            onClick={handleTap}
            disabled={isSaving}
            data-testid="btn-tap"
          >
            <Check className="mr-2 w-7 h-7" />
            Tap!
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full h-14 text-2xl font-bold bg-green-500 hover:bg-green-500/90"
            disabled={isSaving}
            data-testid="btn-finish"
          >
            <Check className="mr-2 w-7 h-7" />
            {isSaving ? "Saving…" : "Finish"}
          </Button>
        )}
      </div>
    </div>
  );
}
