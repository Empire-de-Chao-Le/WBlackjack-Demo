import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type PoolEntry = { id: number; language: string; phrase: string; translation: string };

type Question = {
  entry: PoolEntry;
  type: "tl-en" | "en-tl";
  questionText: string;
  correctOption: string;
  options: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestion(entry: PoolEntry, type: "tl-en" | "en-tl", pool: PoolEntry[]): Question {
  const questionText = type === "tl-en" ? entry.phrase : entry.translation;
  const correctOption = type === "tl-en" ? entry.translation : entry.phrase;

  const distractors: string[] = [];
  const seen = new Set<string>([correctOption]);
  for (const e of shuffle(pool)) {
    if (e.id === entry.id) continue;
    const val = type === "tl-en" ? e.translation : e.phrase;
    if (seen.has(val)) continue;
    seen.add(val);
    distractors.push(val);
    if (distractors.length === 3) break;
  }

  return {
    entry,
    type,
    questionText,
    correctOption,
    options: shuffle([correctOption, ...distractors]),
  };
}

const SESSION_SIZE = 10;

function buildSession(pool: PoolEntry[]): Question[] {
  return shuffle(pool).slice(0, SESSION_SIZE).map((entry) => {
    const type: "tl-en" | "en-tl" = Math.random() < 0.5 ? "tl-en" : "en-tl";
    return buildQuestion(entry, type, pool);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function InternationalFlashcards() {
  const [, setLocation] = useLocation();
  useAndroidBack(() => setLocation("/"));

  const { data: pool, isLoading } = useQuery({
    queryKey: ["word-pool-world"],
    queryFn: async () => {
      const res = await fetch("/api/word-pool/world");
      if (!res.ok) throw new Error("Failed to load world pool");
      return res.json() as Promise<PoolEntry[]>;
    },
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);

  const questionsRef = useRef<Question[]>([]);
  questionsRef.current = questions;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pool && pool.length >= 4) {
      setQuestions(buildSession(pool));
      setCurrentIdx(0);
      setSelectedOption(null);
      setIsCorrect(null);
      setScore(0);
      setSessionDone(false);
    }
  }, [pool]);

  useEffect(() => {
    if (questions.length > 0 && currentIdx >= questions.length) {
      setSessionDone(true);
    }
  }, [currentIdx, questions.length]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const goBack = () => {
    try { sessionStorage.setItem("home_return_tab", "languages"); } catch {}
    setLocation("/");
  };

  const handleOptionClick = (opt: string) => {
    const q = questionsRef.current[currentIdx];
    if (selectedOption !== null || !q) return;
    const correct = opt === q.correctOption;
    setSelectedOption(opt);
    setIsCorrect(correct);
    if (correct) setScore((s) => s + 1);
    // No SRS recording, no retry on wrong — pure shuffle mode.
  };

  const handleQuestionCardClick = () => {
    if (selectedOption === null) return;
    setCurrentIdx((prev) => prev + 1);
    setSelectedOption(null);
    setIsCorrect(null);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = parseInt(e.key) - 1;
        const q = questionsRef.current[currentIdx];
        if (q && selectedOption === null) {
          handleOptionClick(q.options[idx]);
        }
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (selectedOption !== null) handleQuestionCardClick();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedOption, currentIdx]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!pool || pool.length < 4) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground text-center">
          Not enough words across all languages yet (need at least 4).
        </p>
        <button onClick={goBack} className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors">
          <ArrowLeft className="w-7 h-7" />
        </button>
      </div>
    );
  }

  // ── Session done ───────────────────────────────────────────────────────────
  if (sessionDone) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-6 p-6 text-foreground">
        <p className="text-7xl">🌍</p>
        <h2 className="text-2xl font-bold">Session complete!</h2>
        <div className="flex items-end gap-1">
          <span className="text-7xl font-bold text-primary">{score}</span>
          <span className="text-3xl font-semibold text-muted-foreground mb-2">/{SESSION_SIZE}</span>
        </div>
        <button
          onClick={goBack}
          className="mt-2 px-8 py-4 rounded-2xl bg-[#8c3cdd] text-white font-bold text-lg hover:bg-[#7b2fcc] active:scale-95 transition-all"
        >
          Back to Languages
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  if (!currentQ) return null;

  const totalQ = questions.length;
  const progressPct = (currentIdx / totalQ) * 100;

  const qCardBg =
    isCorrect === null ? "bg-card" : isCorrect ? "bg-[#4ade80]" : "bg-[#f87171]";
  const qCardText = isCorrect === null ? "text-foreground" : "text-white";

  const optionClass = (opt: string) => {
    if (selectedOption === null)
      return "bg-card text-foreground hover:bg-muted/60 active:scale-[0.98]";
    if (opt === currentQ.correctOption) return "bg-[#4ade80] text-white";
    if (opt === selectedOption) return "bg-[#f87171] text-white";
    return "bg-card text-foreground opacity-50";
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="min-h-[100dvh] bg-background text-foreground flex flex-col p-4 max-w-lg mx-auto w-full outline-none"
    >
      {/* Top row: back + progress bar (no Ignore button) */}
      <div className="flex items-center gap-3 mb-5 mt-1">
        <button
          onClick={goBack}
          className="shrink-0 p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-[#8c3cdd] transition-all duration-400"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">🌍</span>
      </div>

      {/* Question card */}
      <button
        onClick={handleQuestionCardClick}
        disabled={selectedOption === null}
        className={`
          w-full rounded-3xl border border-border shadow-sm
          flex items-center justify-center p-8 mb-5
          min-h-[180px] transition-colors duration-150
          ${qCardBg}
          ${selectedOption !== null ? "cursor-pointer active:scale-[0.99]" : "cursor-default"}
        `}
      >
        <span className={`text-3xl font-bold text-center leading-snug ${qCardText}`}>
          {currentQ.questionText}
        </span>
      </button>

      {/* Option cards */}
      <div className="flex flex-col gap-3">
        {currentQ.options.map((opt, i) => (
          <button
            key={`${currentIdx}-${i}-${opt}`}
            onClick={() => handleOptionClick(opt)}
            disabled={selectedOption !== null}
            className={`
              w-full rounded-2xl border border-border shadow-sm
              px-6 py-4 text-xl font-bold
              flex items-center gap-4
              transition-all duration-150
              ${optionClass(opt)}
              ${selectedOption === null ? "cursor-pointer" : "cursor-default"}
            `}
          >
            <span className="shrink-0 w-7 h-7 rounded-lg bg-black/10 flex items-center justify-center text-sm font-bold">
              {i + 1}
            </span>
            <span className="flex-1 text-center">{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
