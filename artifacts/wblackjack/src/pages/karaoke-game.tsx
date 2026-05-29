import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  useGetSong,
  useGetSongLyrics,
  useRecordPlay,
  getGetSongQueryKey,
  getGetSongLyricsQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { tokenize } from "@/lib/helpers";

type YTPlayer = {
  getCurrentTime: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (secs: number, allow: boolean) => void;
  setVolume: (vol: number) => void;
  getPlayerState: () => number;
  destroy: () => void;
};

type LyricLine = {
  lineIndex: number;
  original: string;
  timestampMs?: number | null;
};

type Gap = {
  id: string;
  lineIndex: number;
  wordIndex: number;
  word: string;
};

type FilledGap = {
  word: string;
  firstTry: boolean;
};

function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildGaps(lyrics: LyricLine[], difficulty: number): Gap[] {
  const gaps: Gap[] = [];
  for (const line of lyrics) {
    const words = tokenize(line.original);
    if (difficulty === 100) {
      words.forEach((w, i) => {
        gaps.push({ id: `${line.lineIndex}-${i}`, lineIndex: line.lineIndex, wordIndex: i, word: w });
      });
    } else {
      const [minInterval, maxInterval] = difficulty === 33 ? [2, 4] : [7, 11];
      let i = randBetween(minInterval, maxInterval) - 1;
      while (i < words.length) {
        gaps.push({ id: `${line.lineIndex}-${i}`, lineIndex: line.lineIndex, wordIndex: i, word: words[i] });
        i += randBetween(minInterval, maxInterval);
      }
    }
  }
  return gaps;
}

/**
 * Build a 4-slot dock that always contains `currentCorrect` plus 3 decoys
 * drawn randomly from other gap words.
 */
function buildDock(currentCorrect: string, allGapWords: string[]): string[] {
  const pool = allGapWords.filter(
    (w) => w.toLowerCase() !== currentCorrect.toLowerCase()
  );
  const decoys = shuffle(pool).slice(0, 3);
  while (decoys.length < 3) decoys.push("***");
  return shuffle([currentCorrect, ...decoys]);
}

function SpinningWheel({ size = "sm" }: { size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "w-8 h-8 border-4" : "w-5 h-5 border-2";
  return (
    <span
      className={`inline-block ${cls} rounded-full border-primary border-t-transparent animate-spin`}
      style={{ verticalAlign: "middle" }}
    />
  );
}

export default function KaraokeGame() {
  const [, params] = useRoute("/song/:id/karaoke/:difficulty");
  const id = parseInt(params?.id || "0", 10);
  const difficulty = parseInt(params?.difficulty || "10", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: song, isLoading: songLoading } = useGetSong(id, {
    query: { enabled: !!id, queryKey: getGetSongQueryKey(id) },
  });
  const { data: lyrics, isLoading: lyricsLoading } = useGetSongLyrics(id, {
    query: { enabled: !!id, queryKey: getGetSongLyricsQueryKey(id) },
  });
  const recordPlay = useRecordPlay();

  const playerRef = useRef<YTPlayer | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lineTrackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [playerReady, setPlayerReady] = useState(false);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [flashingSlot, setFlashingSlot] = useState<number | null>(null);
  const [filledGaps, setFilledGaps] = useState<Map<string, FilledGap>>(new Map());
  const [dock, setDock] = useState<string[]>(["***", "***", "***", "***"]);
  const [hits, setHits] = useState(0);
  const [fails, setFails] = useState(0);
  /** lineIndex that caused a pause; null when not paused */
  const [pausedLineIndex, setPausedLineIndex] = useState<number | null>(null);

  const gaps = useMemo(() => {
    if (!lyrics) return [];
    return buildGaps(lyrics, difficulty);
  }, [lyrics, difficulty]);

  const currentGapIdx = useMemo(() => {
    return gaps.findIndex((g) => !filledGaps.has(g.id));
  }, [gaps, filledGaps]);

  const allFilled = gaps.length > 0 && currentGapIdx === -1;

  // Initialise dock when gaps are ready
  useEffect(() => {
    if (gaps.length === 0) return;
    const allWords = gaps.map((g) => g.word);
    setDock(buildDock(gaps[0].word, allWords));
  }, [gaps]);

  const extractVideoId = (url: string): string => {
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    return match ? match[1] : url;
  };

  useEffect(() => {
    if (!song) return;
    const existingScript = document.getElementById("yt-api-script");
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }
    if (!existingScript) {
      const tag = document.createElement("script");
      tag.id = "yt-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = initPlayer;
    return () => {
      if (lineTrackIntervalRef.current) clearInterval(lineTrackIntervalRef.current);
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, [song]);

  function initPlayer() {
    if (!song || !window.YT) return;
    playerRef.current = new window.YT.Player("yt-karaoke-player", {
      videoId: extractVideoId(song.youtubeUrl),
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => setPlayerReady(true),
        onStateChange: () => {},
      },
    }) as unknown as YTPlayer;
  }

  // Track current line and trigger pause when song passes a line with unfilled gaps
  useEffect(() => {
    if (!playerReady || !lyrics || lyrics.length === 0) return;
    const timestamps = lyrics.map((l) => ({
      lineIndex: l.lineIndex,
      ms: l.timestampMs ?? null,
    }));

    lineTrackIntervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const currentMs = player.getCurrentTime() * 1000;
      let activeIdx = 0;
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i].ms;
        if (ts !== null && currentMs >= ts) activeIdx = i;
      }
      setCurrentLineIdx(activeIdx);

      const activeLine = lyrics[activeIdx];
      const nextLine = lyrics[activeIdx + 1];
      if (!activeLine) return;
      const nextTs = nextLine?.timestampMs;
      if (nextTs !== null && nextTs !== undefined && currentMs >= nextTs) {
        const lineGaps = gaps.filter((g) => g.lineIndex === activeLine.lineIndex);
        const hasUnfilled = lineGaps.some((g) => !filledGaps.has(g.id));
        if (hasUnfilled && pausedLineIndex === null) {
          startFadeAndPause(activeLine.lineIndex, activeLine.timestampMs ?? null);
        }
      }
    }, 200);

    return () => {
      if (lineTrackIntervalRef.current) clearInterval(lineTrackIntervalRef.current);
    };
  }, [playerReady, lyrics, gaps, filledGaps, pausedLineIndex]);

  function startFadeAndPause(lineIndex: number, seekMs: number | null) {
    if (fadeIntervalRef.current) return;
    setPausedLineIndex(lineIndex);
    let vol = 100;
    fadeIntervalRef.current = setInterval(() => {
      vol -= 10;
      if (vol <= 0) {
        playerRef.current?.setVolume(0);
        playerRef.current?.pauseVideo();
        if (seekMs !== null) {
          playerRef.current?.seekTo(seekMs / 1000, true);
        }
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
      } else {
        playerRef.current?.setVolume(vol);
      }
    }, 200);
  }

  // Resume playback when the paused line's gaps are all filled
  useEffect(() => {
    if (pausedLineIndex === null || !playerReady) return;
    const lineGaps = gaps.filter((g) => g.lineIndex === pausedLineIndex);
    if (lineGaps.length === 0) return;
    const allLineFilled = lineGaps.every((g) => filledGaps.has(g.id));
    if (allLineFilled) {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      playerRef.current?.setVolume(100);
      playerRef.current?.playVideo();
      setPausedLineIndex(null);
    }
  }, [filledGaps, pausedLineIndex, gaps, playerReady]);

  useEffect(() => {
    const lineEl = lineRefs.current[currentLineIdx];
    if (lineEl && lyricsScrollRef.current) {
      lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIdx]);

  const scrollToNextGap = useCallback(() => {
    if (currentGapIdx === -1 || !gaps[currentGapIdx]) return;
    const lineEl = lineRefs.current[gaps[currentGapIdx].lineIndex];
    if (lineEl) lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentGapIdx, gaps]);

  const handleSlotClick = useCallback(
    (word: string, slotIdx: number) => {
      if (word === "***" || currentGapIdx === -1) return;
      const targetGap = gaps[currentGapIdx];
      if (!targetGap) return;

      if (word.trim().toLowerCase() === targetGap.word.trim().toLowerCase()) {
        const isFirstTry = !filledGaps.has(targetGap.id + "_miss");
        setFilledGaps((prev) => {
          const next = new Map(prev);
          next.set(targetGap.id, { word, firstTry: isFirstTry });
          return next;
        });
        if (isFirstTry) setHits((h) => h + 1);

        // Find next unfilled gap index
        const nextGapIdx = gaps.findIndex(
          (g, i) => i > currentGapIdx && !filledGaps.has(g.id)
        );

        // Rebuild dock: next correct answer + decoys
        const allWords = gaps.map((g) => g.word);
        if (nextGapIdx !== -1) {
          setDock(buildDock(gaps[nextGapIdx].word, allWords));
        } else {
          setDock(["***", "***", "***", "***"]);
        }
      } else {
        setFails((f) => f + 1);
        setFilledGaps((prev) => {
          const next = new Map(prev);
          next.set(targetGap.id + "_miss", { word, firstTry: false });
          return next;
        });
        setFlashingSlot(slotIdx);
        setTimeout(() => setFlashingSlot(null), 600);
      }
    },
    [currentGapIdx, gaps, filledGaps]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= 4) handleSlotClick(dock[n - 1], n - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSlotClick, dock]);

  const handleFinish = async () => {
    if (lineTrackIntervalRef.current) clearInterval(lineTrackIntervalRef.current);
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    await recordPlay.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getGetSongQueryKey(id) });
    setLocation(`/song/${id}`);
  };

  if (songLoading || lyricsLoading)
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  if (!song || !lyrics)
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-destructive">
        Song not found
      </div>
    );

  const gapsFilled = filledGaps.size - Array.from(filledGaps.keys()).filter(k => k.endsWith("_miss")).length;
  const totalGaps = gaps.length;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background overflow-hidden max-w-3xl mx-auto w-full">
      <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 shrink-0">
        <Link
          href={`/song/${id}/karaoke`}
          className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          data-testid="link-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex gap-4 text-sm font-bold">
          <span className="text-muted-foreground">
            Gaps <span className="text-foreground">{gapsFilled}/{totalGaps}</span>
          </span>
          <span>
            Hits <span className="text-green-400">{hits}</span>
          </span>
          <span>
            Fails <span className="text-pink-400">{fails}</span>
          </span>
        </div>
      </div>

      <div className="w-full bg-black aspect-video shrink-0 relative">
        <div id="yt-karaoke-player" className="w-full h-full" />
        {!playerReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-muted-foreground">
            Loading player...
          </div>
        )}
      </div>

      <div
        ref={lyricsScrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{ scrollBehavior: "smooth" }}
      >
        {lyrics.map((line, lineArrIdx) => {
          const isCurrent = lineArrIdx === currentLineIdx;
          const isPast = lineArrIdx < currentLineIdx;
          const opacity = isCurrent ? "opacity-100" : isPast ? "opacity-30" : "opacity-40";
          const scale = isCurrent ? "text-2xl md:text-3xl" : "text-lg";
          const words = tokenize(line.original);

          return (
            <div
              key={line.lineIndex}
              ref={(el) => { lineRefs.current[lineArrIdx] = el; }}
              className={`${opacity} ${scale} font-bold leading-loose flex flex-wrap gap-x-2 gap-y-3 transition-all duration-500`}
            >
              {words.map((word, wi) => {
                const gap = gaps.find(
                  (g) => g.lineIndex === line.lineIndex && g.wordIndex === wi
                );
                if (gap) {
                  const filled = filledGaps.get(gap.id);
                  if (filled) {
                    return (
                      <span
                        key={wi}
                        className={`inline-flex items-center ${filled.firstTry ? "text-green-400" : "text-pink-400"}`}
                      >
                        {filled.word}
                        <span className={`ml-1 w-2 h-2 rounded-full ${filled.firstTry ? "bg-green-400" : "bg-pink-400"}`} />
                      </span>
                    );
                  }
                  return (
                    <span key={wi} className="inline-flex items-center">
                      <SpinningWheel size={isCurrent ? "lg" : "sm"} />
                    </span>
                  );
                }
                return <span key={wi}>{word}</span>;
              })}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border/50">
        <div className="flex justify-end mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-1"
            onClick={scrollToNextGap}
            data-testid="btn-next-gap"
          >
            <ChevronsRight className="w-4 h-4" />
            Next gap
          </Button>
        </div>

        {allFilled ? (
          <Button
            className="w-full h-20 text-2xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
            onClick={handleFinish}
            data-testid="btn-finish"
          >
            FINISH
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {dock.map((word, i) => (
              <Button
                key={i}
                className={`h-20 text-xl font-bold border-2 transition-all duration-150 ${
                  flashingSlot === i
                    ? "bg-pink-500/20 border-pink-500 text-pink-400 scale-95"
                    : word === "***"
                    ? "bg-card border-border/30 text-muted-foreground/30 cursor-default"
                    : "bg-card border-border hover:bg-muted hover:border-primary/50 text-foreground"
                }`}
                onClick={() => handleSlotClick(word, i)}
                data-testid={`btn-word-${i + 1}`}
                disabled={word === "***"}
              >
                {word === "***" ? "···" : word}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
