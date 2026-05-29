import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Check, Undo2, Pause, Play, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useCreateSong,
  useUpsertLyrics,
  useSaveTimestamps,
  getListSongsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type YTPlayer = {
  getCurrentTime: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

declare global {
  interface Window {
    YT: {
      Player: new (id: string, opts: object) => YTPlayer;
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
  onExit: () => void;
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
  return match ? match[1] : url;
}

export function SyncTool({ artist, title, youtubeUrl, language, lines, onExit }: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const playerRef = useRef<YTPlayer | null>(null);

  // currentIdx = index of the UPCOMING line to be stamped on the next tap.
  // The bright/middle line is lines[currentIdx - 1] (already stamped & currently playing).
  // At start (currentIdx=0) no line has been stamped → show "···" in the middle slot.
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timestamps, setTimestamps] = useState<
    { lineIndex: number; timestampMs: number }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // Holds all recorded timestamps once every line has been stamped,
  // so "Add to library" can submit them without relying on stale state.
  const finalTimestampsRef = useRef<{ lineIndex: number; timestampMs: number }[]>([]);

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
        onReady: (e: { target: YTPlayer }) => e.target.playVideo(),
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
        ? Math.round(playerRef.current.getCurrentTime() * 1000)
        : 0;

    const newTimestamps = [
      ...timestamps,
      { lineIndex: currentIdx, timestampMs: currentMs },
    ];
    setTimestamps(newTimestamps);
    const nextIdx = currentIdx + 1;
    setCurrentIdx(nextIdx);

    // Store final timestamps for use by "Add to library" — do NOT auto-save
    if (nextIdx >= lines.length) {
      finalTimestampsRef.current = newTimestamps;
    }
  };

  const handleAddToLibrary = () => {
    save(finalTimestampsRef.current);
  };

  // Undo: roll back one line and seek playback to the start of the line that
  // becomes the new bright/current line. If nothing is left, return to the very
  // start (time=0, three-dots state).
  const handleUndo = () => {
    if (currentIdx === 0) return;
    finalTimestampsRef.current = [];
    const newIdx = currentIdx - 1;

    // After undo the new bright line is lines[newIdx - 1]; seek to its recorded
    // start = timestamps[newIdx - 1]. At newIdx === 0 there's no bright line
    // (3-dots state) → go to the beginning of the song.
    const seekMs = newIdx === 0 ? 0 : (timestamps[newIdx - 1]?.timestampMs ?? 0);

    setTimestamps(timestamps.slice(0, newIdx));
    setCurrentIdx(newIdx);

    const player = playerRef.current;
    if (player) {
      player.seekTo(seekMs / 1000, true);
      player.playVideo();
    }
    setIsPaused(false);
  };

  const handlePauseResume = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isPaused) {
      player.playVideo();
      setIsPaused(false);
    } else {
      player.pauseVideo();
      setIsPaused(true);
    }
  };

  const isDone = currentIdx >= lines.length;

  // Spacebar fires the active primary button
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      // Don't hijack space inside inputs/textareas
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      e.preventDefault();
      if (isPaused || showExitConfirm) return;
      if (!isDone) {
        handleTap();
      } else if (!isSaving) {
        handleAddToLibrary();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDone, isSaving, isPaused, showExitConfirm, currentIdx, timestamps]);

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

      <div className="mt-4 shrink-0 space-y-3">
        {!isDone ? (
          <Button
            size="lg"
            className="w-full h-14 text-2xl font-bold bg-primary hover:bg-primary/90 active:scale-[0.97] transition-transform"
            onClick={handleTap}
            disabled={isSaving || isPaused}
            data-testid="btn-tap"
          >
            <Check className="mr-2 w-7 h-7" />
            Tap!
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full h-14 text-2xl font-bold bg-green-500 hover:bg-green-500/90"
            onClick={handleAddToLibrary}
            disabled={isSaving}
            data-testid="btn-add-to-library"
          >
            <Check className="mr-2 w-7 h-7" />
            {isSaving ? "Saving…" : "Add to library"}
          </Button>
        )}

        {/* Secondary controls */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-11 font-medium"
            onClick={handleUndo}
            disabled={currentIdx === 0 || isSaving}
            data-testid="btn-undo"
          >
            <Undo2 className="mr-1.5 w-4 h-4" />
            Undo
          </Button>
          <Button
            variant="outline"
            className="h-11 font-medium"
            onClick={handlePauseResume}
            disabled={isSaving}
            data-testid="btn-pause"
          >
            {isPaused ? (
              <>
                <Play className="mr-1.5 w-4 h-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="mr-1.5 w-4 h-4" />
                Pause
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="h-11 font-medium text-destructive hover:text-destructive"
            onClick={() => setShowExitConfirm(true)}
            disabled={isSaving}
            data-testid="btn-exit"
          >
            <X className="mr-1.5 w-4 h-4" />
            Exit
          </Button>
        </div>
      </div>

      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit Sync Tool?</AlertDialogTitle>
            <AlertDialogDescription>
              Your recorded timestamps will be discarded and not saved. You'll return
              to the Song Lab with your inputs intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-exit-cancel">
              Keep syncing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onExit}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              data-testid="btn-exit-confirm"
            >
              Exit without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
