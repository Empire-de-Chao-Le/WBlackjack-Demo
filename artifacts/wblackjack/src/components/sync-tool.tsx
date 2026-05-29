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
  const playerRef = useRef<{ getCurrentTime: () => number } | null>(null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [timestamps, setTimestamps] = useState<
    { lineIndex: number; timestampMs: number }[]
  >([]);
  const [started, setStarted] = useState(false);
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
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
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

    if (!started) setStarted(true);

    const newTimestamps = [
      ...timestamps,
      { lineIndex: currentIdx, timestampMs: currentMs },
    ];
    setTimestamps(newTimestamps);
    const nextIdx = currentIdx + 1;
    setCurrentIdx(nextIdx);

    // Last line — trigger save immediately without requiring a second tap
    if (nextIdx >= lines.length) {
      save(newTimestamps);
    }
  };

  const isDone = currentIdx >= lines.length;

  const prevLine = lines[currentIdx - 1]?.original;
  const currentLine = lines[currentIdx]?.original;
  const nextLine1 = lines[currentIdx + 1]?.original;
  const nextLine2 = lines[currentIdx + 2]?.original;

  return (
    <div className="flex flex-col h-full absolute inset-0 bg-background z-50 p-4 pb-safe max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-3 shrink-0">
        <h2 className="font-bold text-base">Sync Tool</h2>
        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-medium">
          Preview
        </span>
      </div>

      <div className="aspect-video w-full bg-black rounded-xl overflow-hidden mb-4 shrink-0 shadow-xl">
        <div id="yt-sync-player" className="w-full h-full" />
      </div>

      <div className="flex-1 flex flex-col justify-center px-2 space-y-3 overflow-hidden min-h-0">
        {!started && !isDone && (
          <p className="text-3xl text-muted-foreground/40 text-center tracking-widest animate-pulse select-none">
            ···
          </p>
        )}
        {prevLine && (
          <p className="text-lg text-muted-foreground/30 text-center truncate">
            {prevLine}
          </p>
        )}
        {!isDone ? (
          <p
            className="text-2xl md:text-3xl font-bold text-foreground text-center leading-snug"
            style={{ textShadow: "0 0 24px rgba(200,150,255,0.3)" }}
          >
            {currentLine}
          </p>
        ) : (
          <p className="text-2xl font-bold text-primary text-center">
            {isSaving ? "Saving…" : "Saved!"}
          </p>
        )}
        {nextLine1 && (
          <p className="text-lg text-muted-foreground/30 text-center truncate">
            {nextLine1}
          </p>
        )}
        {nextLine2 && (
          <p className="text-base text-muted-foreground/20 text-center truncate">
            {nextLine2}
          </p>
        )}
        <p className="text-xs text-muted-foreground/40 text-center mt-2">
          {currentIdx} / {lines.length} tapped
        </p>
      </div>

      <div className="mt-4 shrink-0">
        {!isDone && (
          <Button
            size="lg"
            className="w-full h-20 text-2xl font-bold bg-primary hover:bg-primary/90 active:scale-[0.97] transition-transform"
            onClick={handleTap}
            disabled={isSaving}
            data-testid="btn-tap"
          >
            <Check className="mr-2 w-7 h-7" />
            {currentIdx === lines.length - 1 ? "Finish" : "Tap!"}
          </Button>
        )}
      </div>
    </div>
  );
}
