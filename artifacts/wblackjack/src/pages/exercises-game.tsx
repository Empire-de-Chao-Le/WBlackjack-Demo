import { useState, useMemo } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  useGetSong,
  useGetSongLyrics,
  useRecordPlay,
  getGetSongQueryKey,
  getGetSongLyricsQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { isCJK } from "@/lib/helpers";

type LyricLine = {
  lineIndex: number;
  original: string;
  translation: string;
  distractor1?: string | null;
  distractor2?: string | null;
  distractor3?: string | null;
  distractor4?: string | null;
};

type Lesson =
  | { type: "A"; line: LyricLine; shuffledWords: string[] }
  | { type: "B"; line: LyricLine; options: string[] };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tokenize(text: string): string[] {
  const chars = text.split("");
  if (chars.some((c) => isCJK(c))) {
    return chars.filter((c) => c.trim() !== "");
  }
  return text.split(/\s+/).filter(Boolean);
}

function stripPunct(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, "");
}

function buildLessons(lyrics: LyricLine[]): Lesson[] {
  const eligible = lyrics.filter((l) => {
    const words = tokenize(l.original);
    return words.length >= 3;
  });
  if (eligible.length === 0) return [];

  // Pool of all translations for fallback distractors
  const allTranslations = eligible
    .map((l) => l.translation)
    .filter(Boolean) as string[];

  // Enforce exact 5/5 split across 10 lessons
  const typeAssignment = shuffle([...Array(5).fill("A"), ...Array(5).fill("B")]);
  const lessons: Lesson[] = [];
  for (let i = 0; i < 10; i++) {
    const line = eligible[Math.floor(Math.random() * eligible.length)];
    const useTypeA = typeAssignment[i] === "A";

    if (useTypeA) {
      // Type A: reconstruct the *translation* from shuffled words
      const words = tokenize(line.translation);
      lessons.push({ type: "A", line, shuffledWords: shuffle(words) });
    } else {
      const correct = line.translation;
      // Collect distractors: use per-line distractors first, then fill from
      // other lines' translations so there are always exactly 4 distractors.
      const lineDistractors = [
        line.distractor1,
        line.distractor2,
        line.distractor3,
        line.distractor4,
      ].filter(Boolean) as string[];

      const otherTranslations = shuffle(
        allTranslations.filter(
          (t) => t !== correct && !lineDistractors.includes(t)
        )
      );

      const distractors = [...lineDistractors];
      for (const t of otherTranslations) {
        if (distractors.length >= 4) break;
        distractors.push(t);
      }
      // Pad to exactly 4 if not enough unique translations exist
      let padIdx = 1;
      while (distractors.length < 4) {
        distractors.push(`(option ${++padIdx})`);
      }

      lessons.push({
        type: "B",
        line,
        options: shuffle([correct, ...distractors.slice(0, 4)]),
      });
    }
  }
  return lessons;
}

function LessonTypeA({
  lesson,
  onContinue,
}: {
  lesson: Extract<Lesson, { type: "A" }>;
  onContinue: () => void;
}) {
  const [placed, setPlaced] = useState<string[]>([]);
  const [pool, setPool] = useState<{ word: string; id: number }[]>(
    lesson.shuffledWords.map((w, i) => ({ word: w, id: i }))
  );
  const [correct, setCorrect] = useState(false);
  const [flash, setFlash] = useState(false);

  // Type A now reconstructs the *translation* (shuffledWords came from translation)
  const targetWords = tokenize(lesson.line.translation);

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
      <div className="rounded-xl bg-card border border-border p-4 text-center">
        <p className="text-2xl font-bold leading-relaxed">{lesson.line.original}</p>
      </div>
      <p className="text-sm text-muted-foreground text-center">
        Reconstruct the translation
      </p>

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
          <span className="text-muted-foreground/40 text-sm">
            Click words below to place them here
          </span>
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
          Continue
        </Button>
      )}
    </div>
  );
}

function LessonTypeB({
  lesson,
  onContinue,
}: {
  lesson: Extract<Lesson, { type: "B" }>;
  onContinue: () => void;
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

      <p className="text-sm text-muted-foreground text-center">
        Choose the correct translation
      </p>

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
          Continue
        </Button>
      )}
    </div>
  );
}

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
  const recordPlay = useRecordPlay();

  const [lesson, setLesson] = useState(0);
  const [key, setKey] = useState(0);

  const lessons = useMemo<Lesson[]>(() => {
    if (!lyrics) return [];
    return buildLessons(lyrics);
  }, [lyrics]);

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

  if (songLoading || lyricsLoading)
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
          {currentLesson.type === "A" ? "Reconstruct" : "Translate"}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        {currentLesson.type === "A" ? (
          <LessonTypeA key={key} lesson={currentLesson} onContinue={handleContinue} />
        ) : (
          <LessonTypeB key={key} lesson={currentLesson} onContinue={handleContinue} />
        )}
      </div>
    </div>
  );
}
