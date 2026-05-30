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
  // Flatten every word in the song into one ordered list so the interval
  // is applied globally rather than per-line.  Per-line intervals produced
  // zero gaps on short lines (< 7 words) which is the root of the "1 gap
  // for the whole song" bug.
  const allPositions: { lineIndex: number; wordIndex: number; word: string }[] = [];
  for (const line of lyrics) {
    tokenize(line.original).forEach((w, i) => {
      allPositions.push({ lineIndex: line.lineIndex, wordIndex: i, word: w });
    });
  }

  if (difficulty === 100) {
    return allPositions.map((p) => ({
      id: `${p.lineIndex}-${p.wordIndex}`,
      lineIndex: p.lineIndex,
      wordIndex: p.wordIndex,
      word: p.word,
    }));
  }

  // For 10 % use an interval of 8–12 words; for 33 % use 2–4 words.
  const [minGap, maxGap] = difficulty === 33 ? [2, 4] : [8, 12];

  const gaps: Gap[] = [];
  // Start at a random offset inside the first interval so the first blank
  // isn't always the same word of the song.
  let i = randBetween(minGap, maxGap) - 1;
  while (i < allPositions.length) {
    const p = allPositions[i];
    gaps.push({
      id: `${p.lineIndex}-${p.wordIndex}`,
      lineIndex: p.lineIndex,
      wordIndex: p.wordIndex,
      word: p.word,
    });
    i += randBetween(minGap, maxGap);
  }
  return gaps;
}

/**
 * Paper-stacks model — pre-distribute all correct words across 4 stacks.
 *
 * Gaps are processed in groups of 4.  Within each group the 4 answers are
 * assigned to stacks using a fresh random permutation of [0,1,2,3], so
 * across any 4 consecutive gaps every stack receives exactly one answer and
 * the slot the player must tap changes each time.
 *
 * Within a stack the answers sit in the order they will be needed, so the
 * top card is always the NEXT correct answer that lives in that stack.
 * Because the 4 stacks collectively always expose the CURRENT correct answer
 * plus 3 future answers as visible distractors, the invariant holds without
 * any separate decoy pool.
 *
 * Returns 4 arrays (one per stack); each array is consumed front-to-back.
 */
function buildStacks(gaps: Gap[]): string[][] {
  const stacks: string[][] = [[], [], [], []];
  for (let g = 0; g < gaps.length; g += 4) {
    const group = gaps.slice(g, g + 4);
    const slotOrder = shuffle([0, 1, 2, 3]);
    group.forEach((gap, i) => {
      stacks[slotOrder[i]].push(gap.word);
    });
  }
  return stacks;
}

function SpinningWheel({ size = "sm" }: { size?: "sm" | "lg" }) {
  const [wh, sw] = size === "lg" ? [32, 2.5] : [20, 2.0];
  return (
    <span
      className={`inline-flex items-center justify-center animate-spin-slow ${size === "lg" ? "w-8 h-8" : "w-5 h-5"}`}
      style={{ verticalAlign: "middle" }}
    >
      <svg width={wh} height={wh} viewBox="0 0 24 24" fill="none">
        {/* Outer arc: ~290° CW from 3-o'clock (R=9) — forms the spiral body */}
        <path
          d="M21,12 A9,9,0,1,1,15.1,3.5"
          stroke="#8c3cdd"
          strokeWidth={sw}
          strokeLinecap="round"
          fill="none"
        />
        {/* Inner arc: spiral inward ~100° CW (R≈5), connecting outer tip to inner end */}
        <path
          d="M15.1,3.5 A5,5,0,0,1,17,12"
          stroke="#8c3cdd"
          strokeWidth={sw}
          strokeLinecap="round"
          fill="none"
        />
        {/* Arrowhead at inner end pointing CW (downward at 3-o'clock inner) */}
        <path
          d="M14.5,10 L17,14 L19.5,10"
          stroke="#8c3cdd"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
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
  // Array index of the last detected active line — used to detect forward advances.
  const prevActiveArrIdxRef = useRef(0);
  // Timestamp (ms) to seek to when resuming from a pause.
  const resumeSeekMsRef = useRef<number | null>(null);

  const [playerReady, setPlayerReady] = useState(false);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [flashingSlot, setFlashingSlot] = useState<number | null>(null);
  const [filledGaps, setFilledGaps] = useState<Map<string, FilledGap>>(new Map());
  /**
   * 4 stacks of words (front = top / currently visible).
   * Popping the front of a stack happens when the player taps the correct word
   * from that stack; wrong taps leave stacks unchanged.
   */
  const [stacks, setStacks] = useState<string[][]>([[], [], [], []]);
  const [hits, setHits] = useState(0);
  const [fails, setFails] = useState(0);
  /** lineIndex (data-model) of the line that caused a pause; null when not paused */
  const [pausedLineIndex, setPausedLineIndex] = useState<number | null>(null);

  const gaps = useMemo(() => {
    if (!lyrics) return [];
    return buildGaps(lyrics, difficulty);
  }, [lyrics, difficulty]);

  const currentGapIdx = useMemo(() => {
    return gaps.findIndex((g) => !filledGaps.has(g.id));
  }, [gaps, filledGaps]);

  const allFilled = gaps.length > 0 && currentGapIdx === -1;

  // Build stacks once gaps are ready (or whenever the gap set changes).
  useEffect(() => {
    if (gaps.length === 0) return;
    setStacks(buildStacks(gaps));
  }, [gaps]);

  const extractVideoId = (url: string): string => {
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    return match ? match[1] : url;
  };

  // ── YouTube player init ──────────────────────────────────────────────────────
  // Guards against the race where the YT API is already loaded (cached from a
  // previous page) but the #yt-karaoke-player div hasn't mounted yet.
  // The retry timeout is stored in a ref so it can be cancelled on unmount.
  const initRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initPlayer = useCallback(() => {
    if (!song || !window.YT?.Player) return;
    if (playerRef.current) return; // already initialised
    const el = document.getElementById("yt-karaoke-player");
    if (!el) {
      // DOM element not yet mounted — retry on next tick (cancellable).
      initRetryRef.current = setTimeout(initPlayer, 100);
      return;
    }
    playerRef.current = new window.YT.Player("yt-karaoke-player", {
      videoId: extractVideoId(song.youtubeUrl),
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => setPlayerReady(true),
        onStateChange: () => {},
      },
    }) as unknown as YTPlayer;
  }, [song]);

  useEffect(() => {
    if (!song) return;
    if (window.YT?.Player) {
      initPlayer();
    } else {
      const existing = document.getElementById("yt-api-script");
      if (!existing) {
        const tag = document.createElement("script");
        tag.id = "yt-api-script";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    }
    return () => {
      if (initRetryRef.current) clearTimeout(initRetryRef.current);
      if (lineTrackIntervalRef.current) clearInterval(lineTrackIntervalRef.current);
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, [song, initPlayer]);

  // ── Fade, pause & seek back to line start ───────────────────────────────────
  function startFadeAndPause(
    lineDataIndex: number,
    seekMs: number | null,
    lineArrIdx: number
  ) {
    if (fadeIntervalRef.current) return; // already fading
    setPausedLineIndex(lineDataIndex);
    // Reset the "previous" pointer so that after seek-back, the tracker
    // doesn't see a spurious forward jump and retrigger.
    prevActiveArrIdxRef.current = lineArrIdx;
    resumeSeekMsRef.current = seekMs;

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

  // ── Line-tracking interval ────────────────────────────────────────────────────
  // Detects when the song advances to a new line and triggers fade+pause if the
  // line that was just left still has unfilled gaps.
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

      let activeArrIdx = 0;
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i].ms;
        if (ts !== null && currentMs >= ts) activeArrIdx = i;
      }
      setCurrentLineIdx(activeArrIdx);

      // Only react to forward advances (not seeks backward).
      if (activeArrIdx > prevActiveArrIdxRef.current) {
        const prevArrIdx = prevActiveArrIdxRef.current;
        prevActiveArrIdxRef.current = activeArrIdx;

        // Check whether the line we just left had unfilled gaps.
        if (pausedLineIndex === null) {
          const prevLine = lyrics[prevArrIdx];
          if (prevLine) {
            const lineGaps = gaps.filter(
              (g) => g.lineIndex === prevLine.lineIndex
            );
            const hasUnfilled = lineGaps.some((g) => !filledGaps.has(g.id));
            if (hasUnfilled) {
              startFadeAndPause(
                prevLine.lineIndex,
                prevLine.timestampMs ?? null,
                prevArrIdx
              );
            }
          }
        }
      }
    }, 200);

    return () => {
      if (lineTrackIntervalRef.current)
        clearInterval(lineTrackIntervalRef.current);
    };
  }, [playerReady, lyrics, gaps, filledGaps, pausedLineIndex]);

  // ── Resume when the paused line's gaps are all filled ────────────────────────
  useEffect(() => {
    if (pausedLineIndex === null || !playerReady) return;
    const lineGaps = gaps.filter((g) => g.lineIndex === pausedLineIndex);
    if (lineGaps.length === 0) return;
    const allLineFilled = lineGaps.every((g) => filledGaps.has(g.id));
    if (!allLineFilled) return;

    // Cancel any in-flight fade.
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    playerRef.current?.setVolume(100);
    // Seek back to the start of the paused line so it plays from the beginning.
    if (resumeSeekMsRef.current !== null) {
      playerRef.current?.seekTo(resumeSeekMsRef.current / 1000, true);
      resumeSeekMsRef.current = null;
    }
    playerRef.current?.playVideo();
    setPausedLineIndex(null);
  }, [filledGaps, pausedLineIndex, gaps, playerReady]);

  // ── Auto-scroll to current line ───────────────────────────────────────────────
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

  // ── Dock slot handling (paper-stacks model) ──────────────────────────────────
  // • Correct tap  → the tapped stack is popped (top card removed), revealing
  //                  whatever is underneath.  The next correct answer is already
  //                  visible somewhere in the 4 stacks (invariant).
  // • Wrong tap    → stacks are NOT changed; the player must look elsewhere.
  const handleSlotClick = useCallback(
    (word: string, slotIdx: number) => {
      if (word === "***" || currentGapIdx === -1) return;
      const targetGap = gaps[currentGapIdx];
      if (!targetGap) return;

      if (word.trim().toLowerCase() === targetGap.word.trim().toLowerCase()) {
        // ── Correct ──────────────────────────────────────────────────────────
        const isFirstTry = !filledGaps.has(targetGap.id + "_miss");
        setFilledGaps((prev) => {
          const next = new Map(prev);
          next.set(targetGap.id, { word, firstTry: isFirstTry });
          return next;
        });
        if (isFirstTry) setHits((h) => h + 1);

        // Pop the top card from the tapped stack — the next card (if any) in
        // that stack now becomes visible.  The other 3 stacks are untouched.
        setStacks((prev) =>
          prev.map((s, i) => (i === slotIdx ? s.slice(1) : s))
        );
      } else {
        // ── Wrong ────────────────────────────────────────────────────────────
        setFails((f) => f + 1);
        setFilledGaps((prev) => {
          const next = new Map(prev);
          next.set(targetGap.id + "_miss", { word, firstTry: false });
          return next;
        });
        setFlashingSlot(slotIdx);
        setTimeout(() => setFlashingSlot(null), 600);
        // Stacks are unchanged — the correct card is still in another stack.
      }
    },
    [currentGapIdx, gaps, filledGaps]
  );

  // Keyboard shortcuts: 1–4 fire the corresponding dock slot.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= 4) {
        const dock = stacks.map((s) => s[0] ?? "***");
        handleSlotClick(dock[n - 1], n - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSlotClick, stacks]);

  const handleFinish = async () => {
    if (lineTrackIntervalRef.current) clearInterval(lineTrackIntervalRef.current);
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    await recordPlay.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getGetSongQueryKey(id) });
    setLocation(`/song/${id}`);
  };

  if (songLoading || lyricsLoading)
    return (
      <div className="h-[100dvh] flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  if (!song || !lyrics)
    return (
      <div className="h-[100dvh] flex items-center justify-center text-destructive">
        Song not found
      </div>
    );

  const gapsFilled =
    filledGaps.size -
    Array.from(filledGaps.keys()).filter((k) => k.endsWith("_miss")).length;
  const totalGaps = gaps.length;

  return (
    <div className="h-full flex flex-col bg-background max-w-3xl mx-auto w-full overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 shrink-0">
        <Link
          href={`/song/${id}/karaoke`}
          className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          data-testid="link-back"
        >
          <ArrowLeft className="w-7 h-7" />
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
      {/* ── YouTube player — compact ─────────────────────────────────────── */}
      <div className="shrink-0 bg-black relative w-full" style={{ height: "min(36vw, 162px)" }}>
        <div id="yt-karaoke-player" className="w-full h-full" />
        {!playerReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-muted-foreground text-sm">
            Loading player...
          </div>
        )}
      </div>
      {/* ── Lyrics scroll — centred ──────────────────────────────────────── */}
      <div
        ref={lyricsScrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-[10px]"
        style={{ scrollBehavior: "smooth" }}
      >
        {lyrics.map((line, lineArrIdx) => {
          const isCurrent = lineArrIdx === currentLineIdx;
          const isPast = lineArrIdx < currentLineIdx;
          const opacity = isCurrent
            ? "opacity-100"
            : isPast
            ? "opacity-30"
            : "opacity-40";
          const scale = isCurrent ? "text-2xl md:text-3xl" : "text-lg";
          const words = tokenize(line.original);

          return (
            <div
              key={line.lineIndex}
              ref={(el) => {
                lineRefs.current[lineArrIdx] = el;
              }}
              className={`${opacity} ${scale} font-bold leading-tight flex flex-wrap justify-center gap-x-2 gap-y-0 transition-all duration-500`}
            >
              {words.map((word, wi) => {
                const gap = gaps.find(
                  (g) =>
                    g.lineIndex === line.lineIndex && g.wordIndex === wi
                );
                if (gap) {
                  const filled = filledGaps.get(gap.id);
                  if (filled) {
                    return (
                      <span
                        key={wi}
                        className="inline-flex items-center text-green-400 text-[23px]"
                      >
                        {filled.word}
                      </span>
                    );
                  }
                  return (
                    <span key={wi} className="inline-flex items-center">
                      <SpinningWheel size={isCurrent ? "lg" : "sm"} />
                    </span>
                  );
                }
                return <span key={wi} className="mt-[2px] mb-[2px] text-[23px]">{word}</span>;
              })}
            </div>
          );
        })}
      </div>
      {/* ── Dock — always pinned to bottom ──────────────────────────────── */}
      <div className="shrink-0 px-4 pb-safe pt-2 border-t border-border/50">
        {allFilled ? (
          <Button
            className="w-full h-[68px] text-2xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
            onClick={handleFinish}
            data-testid="btn-finish"
          >
            FINISH
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {stacks.map((s, i) => {
              const word = s[0] ?? "***";
              const numCorner = ["top-1.5 left-2", "top-1.5 right-2", "bottom-1.5 left-2", "bottom-1.5 right-2"][i];
              return (
                <Button
                  key={i}
                  className={`relative h-[68px] text-xl font-bold border-2 transition-all duration-150 flex items-center justify-center ${
                    flashingSlot === i
                      ? "bg-pink-500/20 border-pink-500 text-pink-400 scale-95"
                      : word === "***"
                      ? "bg-card border-border/30 text-muted-foreground/30 cursor-default"
                      : "bg-primary hover:bg-primary/90 border-primary text-primary-foreground shadow-md"
                  }`}
                  onClick={() => handleSlotClick(word, i)}
                  data-testid={`btn-word-${i + 1}`}
                  disabled={word === "***"}
                >
                  <span className={`absolute ${numCorner} text-[11px] font-black tracking-widest ${word === "***" ? "opacity-30" : "opacity-60"}`}>{i + 1}</span>
                  <span className="text-xl font-bold leading-none">{word === "***" ? "···" : word}</span>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
