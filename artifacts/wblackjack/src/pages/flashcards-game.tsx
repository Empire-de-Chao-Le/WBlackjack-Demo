import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

// ── TTS (self-contained copy so this page is independent) ─────────────────────
let _ttsEnabled: boolean = (() => {
  try { return localStorage.getItem("tts_enabled") !== "false"; } catch { return true; }
})();

const LANG_MAP: Record<string, string> = {
  polish: "pl-PL", french: "fr-FR", spanish: "es-ES", german: "de-DE",
  italian: "it-IT", portuguese: "pt-PT", russian: "ru-RU", japanese: "ja-JP",
  chinese: "zh-CN", mandarin: "zh-CN", korean: "ko-KR", dutch: "nl-NL",
  swedish: "sv-SE", norwegian: "nb-NO", danish: "da-DK", finnish: "fi-FI",
  czech: "cs-CZ", slovak: "sk-SK", hungarian: "hu-HU", romanian: "ro-RO",
  turkish: "tr-TR", arabic: "ar-SA", hebrew: "he-IL", ukrainian: "uk-UA",
  greek: "el-GR", catalan: "ca-ES",
};

function speak(text: string, langName: string) {
  if (!_ttsEnabled) return;
  if (!("speechSynthesis" in window)) return;
  const langCode = LANG_MAP[langName.toLowerCase().trim()] ?? langName;
  const langPrefix = langCode.split("-")[0].toLowerCase();
  function findVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
    const norm = (s: string) => s.toLowerCase().replace(/_/g, "-");
    const target = norm(langCode);
    return (
      voices.find((v) => norm(v.lang) === target) ??
      voices.find((v) => norm(v.lang).startsWith(langPrefix + "-")) ??
      voices.find((v) => norm(v.lang) === langPrefix) ??
      voices.find((v) => v.name.toLowerCase().includes(langName.toLowerCase()))
    );
  }
  function doSpeak() {
    const voices = window.speechSynthesis.getVoices();
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = langCode;
      const voice = findVoice(voices);
      if (voice) utt.voice = voice;
      window.speechSynthesis.speak(utt);
    }, 100);
  }
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) { doSpeak(); }
  else { window.speechSynthesis.addEventListener("voiceschanged", doSpeak, { once: true }); }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type PoolEntry = { id: number; language: string; phrase: string; translation: string };

type Question = {
  entry: PoolEntry;
  type: "tl-en" | "en-tl";
  questionText: string;
  correctOption: string;
  options: string[];
  tlText: string;
  isOriginal: boolean;
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

function buildQuestion(
  entry: PoolEntry,
  type: "tl-en" | "en-tl",
  pool: PoolEntry[],
  isOriginal: boolean
): Question {
  const questionText = type === "tl-en" ? entry.phrase : entry.translation;
  const correctOption = type === "tl-en" ? entry.translation : entry.phrase;

  const distractors = shuffle(
    pool.filter((e) => {
      if (e.id === entry.id) return false;
      const val = type === "tl-en" ? e.translation : e.phrase;
      return val !== correctOption;
    })
  )
    .slice(0, 3)
    .map((e) => (type === "tl-en" ? e.translation : e.phrase));

  return {
    entry,
    type,
    questionText,
    correctOption,
    options: shuffle([correctOption, ...distractors]),
    tlText: entry.phrase,
    isOriginal,
  };
}

const SESSION_SIZE = 10;

function buildSession(pool: PoolEntry[]): Question[] {
  const selected = shuffle(pool).slice(0, Math.min(SESSION_SIZE, pool.length));
  return selected.map((entry) => {
    const type: "tl-en" | "en-tl" = Math.random() < 0.5 ? "tl-en" : "en-tl";
    return buildQuestion(entry, type, pool, true);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FlashcardsGame() {
  const [, params] = useRoute("/flashcards/:language");
  const [, setLocation] = useLocation();
  const language = decodeURIComponent(params?.language ?? "");

  const { data: pool, isLoading } = useQuery({
    queryKey: ["word-pool", language],
    queryFn: async () => {
      const res = await fetch(`/api/word-pool/${encodeURIComponent(language)}`);
      if (!res.ok) throw new Error("Failed to load word pool");
      return res.json() as Promise<PoolEntry[]>;
    },
    enabled: !!language,
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);

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

  const goBack = () => {
    try { sessionStorage.setItem("home_return_tab", "languages"); } catch {}
    setLocation("/");
  };

  const handleOptionClick = (opt: string) => {
    if (selectedOption !== null || !questions[currentIdx]) return;
    const q = questions[currentIdx];
    const correct = opt === q.correctOption;
    setSelectedOption(opt);
    setIsCorrect(correct);

    // TTS: always read the TL phrase
    speak(q.tlText, language);

    if (correct) {
      if (q.isOriginal) setScore((s) => s + 1);
    } else {
      // Append a duplicate of this question (new random direction)
      if (pool && pool.length >= 4) {
        const dupType: "tl-en" | "en-tl" = Math.random() < 0.5 ? "tl-en" : "en-tl";
        const dup = buildQuestion(q.entry, dupType, pool, false);
        setQuestions((qs) => [...qs, dup]);
      }
    }
  };

  const handleQuestionCardClick = () => {
    if (selectedOption === null) return;
    const nextIdx = currentIdx + 1;
    if (nextIdx >= questions.length) {
      setSessionDone(true);
    } else {
      setCurrentIdx(nextIdx);
      setSelectedOption(null);
      setIsCorrect(null);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading || (pool && pool.length >= 4 && questions.length === 0)) {
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
          Not enough words in the {language} pool yet (need at least 4).
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
        <p className="text-7xl">🎉</p>
        <h2 className="text-2xl font-bold">Session complete!</h2>
        <div className="flex items-end gap-1">
          <span className="text-7xl font-bold text-primary">{score}</span>
          <span className="text-3xl font-semibold text-muted-foreground mb-2">
            /{Math.min(SESSION_SIZE, questions.filter((q) => q.isOriginal).length)}
          </span>
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

  // Card colors
  const qCardBg =
    isCorrect === null
      ? "bg-card"
      : isCorrect
      ? "bg-[#4ade80]"
      : "bg-[#f87171]";

  const qCardText =
    isCorrect === null ? "text-foreground" : "text-white";

  const optionClass = (opt: string) => {
    if (selectedOption === null) {
      return "bg-card text-foreground hover:bg-muted/60 active:scale-[0.98]";
    }
    if (opt === currentQ.correctOption) {
      return "bg-[#4ade80] text-white";
    }
    if (opt === selectedOption) {
      return "bg-[#f87171] text-white";
    }
    return "bg-card text-foreground opacity-50";
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col p-4 max-w-lg mx-auto w-full">
      {/* Top row: back + progress bar */}
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
        <span className="shrink-0 text-sm font-semibold text-muted-foreground min-w-[40px] text-right">
          {currentIdx}/{totalQ}
        </span>
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
        {currentQ.options.map((opt) => (
          <button
            key={opt}
            onClick={() => handleOptionClick(opt)}
            disabled={selectedOption !== null}
            className={`
              w-full rounded-2xl border border-border shadow-sm
              px-6 py-4 text-xl font-bold text-center
              transition-all duration-150
              ${optionClass(opt)}
              ${selectedOption === null ? "cursor-pointer" : "cursor-default"}
            `}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
