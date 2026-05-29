import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  useGetSong,
  useGetSongLyrics,
  useRecordPlay,
  getGetSongQueryKey,
  getGetSongLyricsQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { tokenize } from "@/lib/helpers";

type LyricLine = {
  lineIndex: number;
  original: string;
  translation: string;
  distractor1?: string | null;
  distractor2?: string | null;
  distractor3?: string | null;
  distractor4?: string | null;
};

type VocabEntry = { id: number; songId: number; phrase: string; translation: string };

type WordCloudItem = { id: number; phrase: string };
type WordCloudTranslation = { id: number; translation: string };

type Lesson =
  | { type: "A"; line: LyricLine; shuffledWords: string[] }
  | { type: "B"; line: LyricLine; options: string[] }
  | { type: "C"; leftItems: WordCloudItem[]; rightItems: WordCloudTranslation[] };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stripPunct(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, "");
}

function buildLessons(lyrics: LyricLine[], vocab: VocabEntry[]): Lesson[] {
  const eligible = lyrics.filter((l) => tokenize(l.original).length >= 3);
  if (eligible.length === 0) return [];

  const hasVocab = vocab.length >= 9;
  const typeCount = hasVocab ? 3 : 2;

  const lessons: Lesson[] = [];
  for (let i = 0; i < 10; i++) {
    const pick = Math.floor(Math.random() * typeCount);

    if (pick === 0) {
      // Type A: reconstruct the original foreign-language line
      const line = eligible[Math.floor(Math.random() * eligible.length)];
      const words = tokenize(line.original);
      lessons.push({ type: "A", line, shuffledWords: shuffle(words) });
    } else if (pick === 1) {
      // Type B: choose the correct translation
      const line = eligible[Math.floor(Math.random() * eligible.length)];
      const correct = line.translation;
      const csvDistractors = [
        line.distractor1,
        line.distractor2,
        line.distractor3,
        line.distractor4,
      ].filter((d): d is string => typeof d === "string" && d.trim() !== "");
      lessons.push({ type: "B", line, options: shuffle([correct, ...csvDistractors]) });
    } else {
      // Type C: word cloud matching
      const selected = shuffle(vocab).slice(0, 9);
      const leftItems: WordCloudItem[] = selected.map((v) => ({ id: v.id, phrase: v.phrase }));
      const rightItems: WordCloudTranslation[] = shuffle(
        selected.map((v) => ({ id: v.id, translation: v.translation }))
      );
      lessons.push({ type: "C", leftItems, rightItems });
    }
  }
  return lessons;
}

// ─── Type A ──────────────────────────────────────────────────────────────────

function LessonTypeA({
  lesson,
  onContinue,
  isLast,
}: {
  lesson: Extract<Lesson, { type: "A" }>;
  onContinue: () => void;
  isLast: boolean;
}) {
  const [placed, setPlaced] = useState<string[]>([]);
  const [pool, setPool] = useState<{ word: string; id: number }[]>(
    lesson.shuffledWords.map((w, i) => ({ word: w, id: i }))
  );
  const [correct, setCorrect] = useState(false);
  const [flash, setFlash] = useState(false);

  const targetWords = tokenize(lesson.line.original);

  const handlePickWord = (id: number, word: string) => {
    if (correct) return;
    const newPlaced = [...placed, word];
    setPlaced(newPlaced);
    setPool((prev) => prev.filter((p) => p.id !== id));
    const stripped = newPlaced.map(stripPunct);
    const target = targetWords.map(stripPunct);
    if (
      stripped.length === target.length &&
      stripped.every((w, i) => w.toLowerCase() === target[i].toLowerCase())
    ) {
      setCorrect(true);
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }
  };

  const handleRemoveWord = (idx: number) => {
    if (correct) return;
    const word = placed[idx];
    setPlaced((prev) => prev.filter((_, i) => i !== idx));
    const originalId = lesson.shuffledWords.reduce((acc, w, i) => {
      if (w === word && !pool.find((p) => p.id === i) && acc === -1) return i;
      return acc;
    }, -1);
    setPool((prev) =>
      [...prev, { word, id: originalId >= 0 ? originalId : Date.now() }].sort(
        (a, b) => a.id - b.id
      )
    );
  };

  return (
    <div className="flex flex-col gap-6 flex-1">
      <p className="text-sm text-muted-foreground text-center">Reconstruct the original line</p>
      <div
        className={`min-h-20 border-2 rounded-xl p-4 flex flex-wrap gap-2 items-center transition-colors ${
          correct
            ? flash
              ? "border-green-400 bg-green-400/10"
              : "border-green-400/50 bg-green-400/5"
            : "border-border bg-card/50"
        }`}
        data-testid="answer-area"
      >
        {placed.length === 0 && (
          <span className="text-muted-foreground/40 text-sm">Click words below to place them here</span>
        )}
        {placed.map((word, i) => (
          <button
            key={i}
            onClick={() => handleRemoveWord(i)}
            className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary font-medium hover:bg-primary/30 transition-colors"
            data-testid={`placed-word-${i}`}
          >
            {word}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 min-h-16 items-start" data-testid="word-pool">
        {pool.map(({ word, id }) => (
          <button
            key={id}
            onClick={() => handlePickWord(id, word)}
            className="px-3 py-2 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-muted text-foreground font-medium transition-colors"
            data-testid={`pool-word-${id}`}
          >
            {word}
          </button>
        ))}
      </div>
      {correct && (
        <Button
          className="mt-auto w-full h-16 text-xl font-bold bg-green-500 hover:bg-green-500/90 text-black"
          onClick={onContinue}
          data-testid="btn-continue"
        >
          {isLast ? "Finish" : "Continue"}
        </Button>
      )}
    </div>
  );
}

// ─── Type B ──────────────────────────────────────────────────────────────────

function LessonTypeB({
  lesson,
  onContinue,
  isLast,
}: {
  lesson: Extract<Lesson, { type: "B" }>;
  onContinue: () => void;
  isLast: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);

  const correct = selected === lesson.line.translation;

  const handleSelect = (option: string) => {
    if (selected === lesson.line.translation) return;
    if (option === lesson.line.translation) {
      setSelected(option);
    } else {
      setWrongFlash(option);
      setTimeout(() => setWrongFlash(null), 600);
      setSelected(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="rounded-xl bg-card border border-border p-4 text-center">
        <p className="text-2xl font-bold leading-relaxed">{lesson.line.original}</p>
      </div>
      <p className="text-sm text-muted-foreground text-center">Choose the correct translation</p>
      <div className="flex flex-col gap-3 flex-1">
        {lesson.options.map((opt, i) => {
          const isCorrectSelected = opt === lesson.line.translation && selected === opt;
          const isWrong = wrongFlash === opt;
          return (
            <button
              key={i}
              onClick={() => handleSelect(opt)}
              className={`w-full min-h-16 px-5 py-3 rounded-xl border-2 text-left text-base font-medium transition-all ${
                isCorrectSelected
                  ? "border-green-400 bg-green-400/10 text-green-300"
                  : isWrong
                  ? "border-pink-500 bg-pink-500/10 text-pink-300 scale-95"
                  : "border-border bg-card hover:border-primary/50 hover:bg-muted text-foreground"
              }`}
              data-testid={`btn-option-${i}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {correct && (
        <Button
          className="w-full h-16 text-xl font-bold bg-green-500 hover:bg-green-500/90 text-black"
          onClick={onContinue}
          data-testid="btn-continue"
        >
          {isLast ? "Finish" : "Continue"}
        </Button>
      )}
    </div>
  );
}

// ─── Type C: Word Cloud ───────────────────────────────────────────────────────

function LessonTypeC({
  lesson,
  onContinue,
  isLast,
}: {
  lesson: Extract<Lesson, { type: "C" }>;
  onContinue: () => void;
  isLast: boolean;
}) {
  const { leftItems, rightItems } = lesson;

  const [selectedLeftPos, setSelectedLeftPos] = useState<number | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<number>>(new Set());
  const [wrongFlash, setWrongFlash] = useState(false);
  // keyboard phase: 'left' = waiting for left number, 'right' = waiting for right number
  const [kbPhase, setKbPhase] = useState<"left" | "right">("left");

  const allMatched = matchedIds.size === leftItems.length;

  // Use a ref so the keydown handler always reads current state without stale closures
  const stateRef = useRef({ selectedLeftPos, matchedIds, kbPhase });
  useEffect(() => {
    stateRef.current = { selectedLeftPos, matchedIds, kbPhase };
  });

  const tryMatch = (leftPos: number, rightPos: number) => {
    const leftId = leftItems[leftPos].id;
    const rightId = rightItems[rightPos].id;
    if (leftId === rightId) {
      setMatchedIds((prev) => new Set([...prev, leftId]));
      setSelectedLeftPos(null);
      setKbPhase("left");
      setWrongFlash(false);
    } else {
      setWrongFlash(true);
      setTimeout(() => setWrongFlash(false), 600);
    }
  };

  const handleLeftClick = (pos: number) => {
    if (matchedIds.has(leftItems[pos].id)) return;
    setSelectedLeftPos(pos);
    setKbPhase("right");
    setWrongFlash(false);
  };

  const handleRightClick = (pos: number) => {
    if (matchedIds.has(rightItems[pos].id)) return;
    if (selectedLeftPos === null) return;
    tryMatch(selectedLeftPos, pos);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const { selectedLeftPos, matchedIds, kbPhase } = stateRef.current;

      if (e.key === "Tab") {
        if (selectedLeftPos !== null) {
          e.preventDefault();
          setKbPhase("right");
        }
        return;
      }

      const digit = parseInt(e.key, 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;
      const pos = digit - 1;

      if (kbPhase === "left") {
        if (pos < leftItems.length && !matchedIds.has(leftItems[pos].id)) {
          setSelectedLeftPos(pos);
          setKbPhase("right");
          setWrongFlash(false);
        }
      } else {
        // right phase
        if (pos < rightItems.length && !matchedIds.has(rightItems[pos].id) && selectedLeftPos !== null) {
          // call tryMatch but we need current selectedLeftPos
          const leftId = leftItems[selectedLeftPos].id;
          const rightId = rightItems[pos].id;
          if (leftId === rightId) {
            setMatchedIds((prev) => new Set([...prev, leftId]));
            setSelectedLeftPos(null);
            setKbPhase("left");
            setWrongFlash(false);
          } else {
            setWrongFlash(true);
            setTimeout(() => setWrongFlash(false), 600);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [leftItems, rightItems]);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <p className="text-sm text-muted-foreground text-center">
        Match each word to its translation
        <span className="ml-2 text-xs opacity-60">(click or press 1-9 · Tab · 1-9)</span>
      </p>

      <div className="flex gap-3 flex-1">
        {/* Left column — TL words */}
        <div className="flex flex-col gap-2 flex-1">
          {leftItems.map((item, pos) => {
            const isMatched = matchedIds.has(item.id);
            const isSelected = selectedLeftPos === pos;
            const isWrong = isSelected && wrongFlash;
            return (
              <button
                key={item.id}
                onClick={() => handleLeftClick(pos)}
                disabled={isMatched}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium text-left transition-all w-full ${
                  isMatched
                    ? "border-green-700/40 bg-green-900/20 text-green-600 line-through cursor-default"
                    : isWrong
                    ? "border-red-500 bg-red-500/10 text-red-400 animate-pulse"
                    : isSelected
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted text-foreground cursor-pointer"
                }`}
                data-testid={`left-${pos}`}
              >
                <span className="text-xs text-muted-foreground w-4 shrink-0">{pos + 1}</span>
                <span>{item.phrase}</span>
              </button>
            );
          })}
        </div>

        {/* Right column — shuffled translations */}
        <div className="flex flex-col gap-2 flex-1">
          {rightItems.map((item, pos) => {
            const isMatched = matchedIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleRightClick(pos)}
                disabled={isMatched || selectedLeftPos === null}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium text-left transition-all w-full ${
                  isMatched
                    ? "border-green-700/40 bg-green-900/20 text-green-600 line-through cursor-default"
                    : selectedLeftPos !== null
                    ? "border-border bg-card hover:border-primary/40 hover:bg-muted text-foreground cursor-pointer"
                    : "border-border bg-card text-foreground opacity-60 cursor-default"
                }`}
                data-testid={`right-${pos}`}
              >
                <span className="text-xs text-muted-foreground w-4 shrink-0">{pos + 1}</span>
                <span>{item.translation}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        className="w-full h-14 text-lg font-bold bg-green-500 hover:bg-green-500/90 text-black disabled:opacity-30 disabled:cursor-not-allowed"
        onClick={onContinue}
        disabled={!allMatched}
        data-testid="btn-continue"
      >
        {isLast ? "Finish" : "Continue"}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExercisesGame() {
  const [, params] = useRoute("/song/:id/exercises");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: song, isLoading: songLoading } = useGetSong(id, {
    query: { enabled: !!id, queryKey: getGetSongQueryKey(id) },
  });
  const { data: lyrics, isLoading: lyricsLoading } = useGetSongLyrics(id, {
    query: { enabled: !!id, queryKey: getGetSongLyricsQueryKey(id) },
  });
  const { data: vocab = [], isLoading: vocabLoading } = useQuery({
    queryKey: ["song-vocab", id],
    queryFn: async (): Promise<VocabEntry[]> => {
      const res = await fetch(`/api/songs/${id}/vocab`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const recordPlay = useRecordPlay();

  const [lesson, setLesson] = useState(0);
  const [key, setKey] = useState(0);

  const lessons = useMemo<Lesson[]>(() => {
    if (!lyrics) return [];
    return buildLessons(lyrics, vocab);
  }, [lyrics, vocab]);

  const handleContinue = async () => {
    if (lesson < 9) {
      setLesson((prev) => prev + 1);
      setKey((k) => k + 1);
    } else {
      await recordPlay.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetSongQueryKey(id) });
      setLocation(`/song/${id}`);
    }
  };

  if (songLoading || lyricsLoading || vocabLoading)
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  if (!song || !lyrics || lessons.length === 0)
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground text-center">
          No lyrics found — add lyrics from the Song Lab to play exercises.
        </p>
        <Link href={`/song/${id}`}>
          <Button variant="outline">Back to Song</Button>
        </Link>
      </div>
    );

  const currentLesson = lessons[lesson];
  const badgeLabel =
    currentLesson.type === "A" ? "Reconstruct" :
    currentLesson.type === "B" ? "Translate" : "Match";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background p-4 max-w-lg mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <Link
          href={`/song/${id}`}
          className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground"
          data-testid="link-back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="font-bold text-primary bg-primary/10 px-4 py-1 rounded-full border border-primary/20">
          Lesson {lesson + 1} / 10
        </div>
        <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
          {badgeLabel}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        {currentLesson.type === "A" ? (
          <LessonTypeA key={key} lesson={currentLesson} onContinue={handleContinue} isLast={lesson === 9} />
        ) : currentLesson.type === "B" ? (
          <LessonTypeB key={key} lesson={currentLesson} onContinue={handleContinue} isLast={lesson === 9} />
        ) : (
          <LessonTypeC key={key} lesson={currentLesson} onContinue={handleContinue} isLast={lesson === 9} />
        )}
      </div>
    </div>
  );
}
