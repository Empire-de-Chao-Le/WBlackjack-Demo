import { useEffect, useState, useRef } from "react";
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
  getGetSongQueryKey,
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
  onSaved: () => void;
  vocabCsv?: string;
  existingSongId?: number;
  csvFilename?: string;
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
  return match ? match[1] : url;
}

export function SyncTool({ artist, title, youtubeUrl, language, lines, onExit, onSaved, vocabCsv, existingSongId, csvFilename }: Props) {
  const queryClient = useQueryClient();
  const playerRef = useRef<YTPlayer | null>(null);
  const initRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [timestamps, setTimestamps] = useState<
    { lineIndex: number; timestampMs: number }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const finalTimestampsRef = useRef<{ lineIndex: number; timestampMs: number }[]>([]);
  const resumeAfterExitRef = useRef(false);

  const createSong = useCreateSong();
  const upsertLyrics = useUpsertLyrics();
  const saveTimestamps = useSaveTimestamps();

  function initPlayer() {
    if (playerRef.current) return;
    if (!window.YT?.Player) return;
    const el = document.getElementById("yt-sync-player");
    if (!el) {
      initRetryRef.current = setTimeout(initPlayer, 100);
      return;
    }
    playerRef.current = new window.YT.Player("yt-sync-player", {
      videoId: extractVideoId(youtubeUrl),
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
      events: {
        onReady: (e: { target: YTPlayer }) => e.target.playVideo(),
      },
    });
  }

  useEffect(() => {
    const existingScript = document.getElementById("yt-sync-script");
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!existingScript) {
        const tag = document.createElement("script");
        tag.id = "yt-sync-script";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    }
    return () => {
      if (initRetryRef.current) clearTimeout(initRetryRef.current);
    };
  }, []);

  const save = async (finalTimestamps: { lineIndex: number; timestampMs: number }[]) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      let songId: number;
      if (existingSongId) {
        songId = existingSongId;
        if (csvFilename) {
          await fetch(`/api/songs/${songId}`, {
            method: "PATCH",
            body: JSON.stringify({ csvFilename }),
            headers: { "Content-Type": "application/json" },
          });
        }
      } else {
        const song = await createSong.mutateAsync({
          data: { artist, title, youtubeUrl, language, csvFilename },
        });
        songId = song.id;
      }

      await upsertLyrics.mutateAsync({ id: songId, data: { lines } });

      await saveTimestamps.mutateAsync({
        id: songId,
        data: { timestamps: finalTimestamps },
      });

      if (vocabCsv) {
        await fetch(`/api/songs/${songId}/vocab/csv`, {
          method: "POST",
          body: vocabCsv,
          headers: { "Content-Type": "text/csv" },
        });
      }

      queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
      if (existingSongId) {
        queryClient.invalidateQueries({ queryKey: getGetSongQueryKey(existingSongId) });
      }
      onSaved();
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

    if (nextIdx >= lines.length) {
      finalTimestampsRef.current = newTimestamps;
    }
  };

  const handleAddToLibrary = () => {
    save(finalTimestampsRef.current);
  };

  const handleUndo = () => {
    if (currentIdx === 0) return;
    finalTimestampsRef.current = [];
    const newIdx = currentIdx - 1;

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

  const handleExitClick = () => {
    const player = playerRef.current;
    if (player && !isPaused) {
      player.pauseVideo();
      setIsPaused(true);
      resumeAfterExitRef.current = true;
    } else {
      resumeAfterExitRef.current = false;
    }
    setShowExitConfirm(true);
  };

  const handleExitDialogChange = (open: boolean) => {
    setShowExitConfirm(open);
    if (!open && resumeAfterExitRef.current) {
      playerRef.current?.playVideo();
      setIsPaused(false);
      resumeAfterExitRef.current = false;
    }
  };

  const isDone = currentIdx >= lines.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === "Backspace") {
        e.preventDefault();
        if (!showExitConfirm) handleUndo();
        return;
      }
      if (e.code !== "Space") return;
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

  const pastLine    = lines[currentIdx - 2]?.original ?? null;
  const middleLine  = currentIdx > 0 ? (lines[currentIdx - 1]?.original ?? null) : null;
  const upcomingLine  = lines[currentIdx]?.original ?? null;
  const upcoming2Line = lines[currentIdx + 1]?.original ?? null;

  const saveButtonLabel = existingSongId ? "Save timestamps" : "Add to library";
  const exitDialogDescription = existingSongId
    ? "Your recorded timestamps will be discarded. You'll return to the edit page."
    : "Your recorded timestamps will be discarded and not saved. You'll return to the Song Lab with your inputs intact.";

  return (
    <div className="flex flex-col h-full absolute inset-0 bg-background z-50 p-4 pb-safe max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-3 shrink-0">
        <h2 className="font-bold text-base">Sync Tool</h2>
        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-medium">
          {currentIdx} / {lines.length} tapped
        </span>
      </div>

      {/* YouTube player — 63% width */}
      <div className="w-[63%] mx-auto bg-black rounded-xl overflow-hidden mb-4 shrink-0 shadow-xl">
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
            {isSaving ? "Saving…" : saveButtonLabel}
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
            onClick={handleExitClick}
            disabled={isSaving}
            data-testid="btn-exit"
          >
            <X className="mr-1.5 w-4 h-4" />
            Exit
          </Button>
        </div>
      </div>

      <AlertDialog open={showExitConfirm} onOpenChange={handleExitDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit Sync Tool?</AlertDialogTitle>
            <AlertDialogDescription>
              {exitDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-exit-cancel">
              Keep syncing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resumeAfterExitRef.current = false;
                onExit();
              }}
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
