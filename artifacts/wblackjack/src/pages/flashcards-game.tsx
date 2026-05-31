import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, Volume2, VolumeX } from "lucide-react";

// ── TTS (self-contained copy so this page is independent) ─────────────────────
let _ttsEnabled: boolean = (() => {
  try { return localStorage.getItem("tts_enabled") !== "false"; } catch { return true; }
})();

// Generation counter — incremented on every speak() call so that stale voiceschanged
// listeners and stale setTimeout callbacks from a previous language become no-ops.
let _speakGen = 0;

const LANG_MAP: Record<string, string> = {
  polish: "pl-PL", french: "fr-FR", spanish: "es-ES", german: "de-DE",
  italian: "it-IT", portuguese: "pt-PT", russian: "ru-RU", japanese: "ja-JP",
  chinese: "zh-CN", mandarin: "zh-CN", cantonese: "zh-HK", korean: "ko-KR", dutch: "nl-NL",
  swedish: "sv-SE", norwegian: "nb-NO", danish: "da-DK", finnish: "fi-FI",
  czech: "cs-CZ", slovak: "sk-SK", hungarian: "hu-HU", romanian: "ro-RO",
  turkish: "tr-TR", arabic: "ar-SA", hebrew: "he-IL", ukrainian: "uk-UA",
  greek: "el-GR", catalan: "ca-ES",
};

function speak(text: string, langName: string) {
  if (!_ttsEnabled) return;
  if (!("speechSynthesis" in window)) return;
  const gen = ++_speakGen;
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
    // If a newer speak() call has been made since this one, discard this utterance.
    if (gen !== _speakGen) return;
    const voices = window.speechSynthesis.getVoices();
    window.speechSynthesis.cancel();
    setTimeout(() => {
      if (gen !== _speakGen) return;
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

  // Collect up to 3 distractors with UNIQUE values so two options are never identical
  // (duplicate option strings would collide as React keys and leave ghost nodes).
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
    tlText: entry.phrase,
    isOriginal,
  };
}

// The device's local calendar date (YYYY-MM-DD). Used so "tomorrow" is real
// calendar tomorrow in the user's timezone, and due dates sync across devices.
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Build the session questions from the SRS-ordered card ids. Distractors are
// still drawn from the whole language pool; direction is randomized per card.
function buildSessionFromIds(cardIds: number[], pool: PoolEntry[]): Question[] {
  const byId = new Map(pool.map((e) => [e.id, e]));
  const questions: Question[] = [];
  for (const id of cardIds) {
    const entry = byId.get(id);
    if (!entry) continue;
    const type: "tl-en" | "en-tl" = Math.random() < 0.5 ? "tl-en" : "en-tl";
    questions.push(buildQuestion(entry, type, pool, true));
  }
  return questions;
}

// Record a review result in the DB (fire-and-forget; errors are logged).
function recordReview(wordPoolId: number, correct: boolean): void {
  fetch(`/api/flashcards/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wordPoolId, correct, today: localToday() }),
  }).catch((err) => console.error("Failed to record flashcard review", err));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FlashcardsGame() {
  const [, params] = useRoute("/flashcards/:language");
  const [, setLocation] = useLocation();
  const language = decodeURIComponent(params?.language ?? "");

  const { data: pool, isLoading: poolLoading } = useQuery({
    queryKey: ["word-pool", language],
    queryFn: async () => {
      const res = await fetch(`/api/word-pool/${encodeURIComponent(language)}`);
      if (!res.ok) throw new Error("Failed to load word pool");
      return res.json() as Promise<PoolEntry[]>;
    },
    enabled: !!language,
  });

  // SRS session: which cards are due today (plus new cards), in study order.
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["flashcards-due", language],
    queryFn: async () => {
      const res = await fetch(
        `/api/flashcards/due/${encodeURIComponent(language)}?today=${localToday()}`
      );
      if (!res.ok) throw new Error("Failed to load due cards");
      return res.json() as Promise<{
        cardIds: number[];
        ignoredIds: number[];
        dueCount: number;
        newCount: number;
        totalAvailable: number;
      }>;
    },
    enabled: !!language,
  });

  const isLoading = poolLoading || sessionLoading;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [confirmingIgnore, setConfirmingIgnore] = useState(false);
  const [ttsOn, setTtsOn] = useState(_ttsEnabled);

  const toggleTts = () => {
    _ttsEnabled = !_ttsEnabled;
    try { localStorage.setItem("tts_enabled", String(_ttsEnabled)); } catch {}
    setTtsOn(_ttsEnabled);
  };

  // Ref kept in sync every render so click handlers never close over stale length
  const questionsRef = useRef<Question[]>([]);
  questionsRef.current = questions;

  // Ref on the page container — focusing a real DOM node works inside iframes
  // (unlike window.focus() which browsers block from within frames).
  const containerRef = useRef<HTMLDivElement>(null);

  // Pool with ignored words stripped out — used as the distractor source so
  // ignored words never appear as wrong-answer choices either.
  const ignoredSet = new Set(session?.ignoredIds ?? []);
  const distractorPool = pool ? pool.filter((e) => !ignoredSet.has(e.id)) : [];

  useEffect(() => {
    if (pool && pool.length >= 4 && session) {
      const ignored = new Set(session.ignoredIds ?? []);
      const dPool = pool.filter((e) => !ignored.has(e.id));
      setQuestions(buildSessionFromIds(session.cardIds, dPool));
      setCurrentIdx(0);
      setSelectedOption(null);
      setIsCorrect(null);
      setScore(0);
      setSessionDone(false);
    }
  }, [pool, session]);

  // Detect session end with always-fresh state — avoids stale closure on currentIdx/questions.length
  useEffect(() => {
    if (questions.length > 0 && currentIdx >= questions.length) {
      setSessionDone(true);
    }
  }, [currentIdx, questions.length]);

  // Dismiss the confirmation prompt whenever the card changes.
  useEffect(() => { setConfirmingIgnore(false); }, [currentIdx]);

  const goBack = () => {
    try { sessionStorage.setItem("home_return_tab", "languages"); } catch {}
    setLocation("/");
  };

  // Focus the container element on mount — focusing a real DOM node gives the
  // iframe window keyboard focus immediately, without needing a mouse click.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Keyboard shortcuts: 1-4 pick options, Space/Enter advance question card
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

  const handleOptionClick = (opt: string) => {
    // Use the ref (not the state array) so this function is never stale when
    // called from the keyboard effect — state closes over the questions array
    // at the time the effect was registered, but the ref is always current.
    const q = questionsRef.current[currentIdx];
    if (selectedOption !== null || !q) return;
    const correct = opt === q.correctOption;
    setSelectedOption(opt);
    setIsCorrect(correct);

    // TTS: always read the TL phrase
    speak(q.tlText, language);

    // Only the ORIGINAL pull of a card counts: it scores and persists the SRS
    // review. In-session retries (isOriginal=false) are pure practice — they
    // never score and never POST, so they don't double-count toward scheduling.
    if (q.isOriginal) {
      if (correct) setScore((s) => s + 1);
      recordReview(q.entry.id, correct);

      // Missed an original card → re-show it later this session (new random
      // direction) so the user practices it again before the session ends.
      // This is the deliberate exception to the once-per-day pull rule.
      if (!correct && distractorPool.length >= 4) {
        const dupType: "tl-en" | "en-tl" = q.type === "tl-en" ? "en-tl" : "tl-en";
        const dup = buildQuestion(q.entry, dupType, distractorPool, false);
        setQuestions((qs) => [...qs, dup]);
      }
    }
  };

  // First click arms the confirmation; second click (via handleIgnoreConfirm) executes.
  const handleIgnore = () => setConfirmingIgnore(true);

  const handleIgnoreConfirm = () => {
    setConfirmingIgnore(false);
    const q = questionsRef.current[currentIdx];
    if (!q) return;
    const entryId = q.entry.id;

    // Persist the ignore flag (fire-and-forget).
    fetch("/api/flashcards/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordPoolId: entryId }),
    }).catch((err) => console.error("Failed to ignore card", err));

    // Remove this card and any pending in-session retries of the same word.
    const qs = questionsRef.current;
    const nextQuestions = [
      ...qs.slice(0, currentIdx),
      ...qs.slice(currentIdx + 1).filter((q2) => q2.entry.id !== entryId),
    ];
    setQuestions(nextQuestions);
    setSelectedOption(null);
    setIsCorrect(null);

    // If nothing is left at or after the current index, the session is done.
    if (currentIdx >= nextQuestions.length) {
      setSessionDone(true);
    }
  };

  const handleQuestionCardClick = () => {
    if (selectedOption === null) return;
    // Always advance — the useEffect above detects when we've gone past the end
    setCurrentIdx((prev) => prev + 1);
    setSelectedOption(null);
    setIsCorrect(null);
  };

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
            /{questions.filter((q) => q.isOriginal).length}
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
    <div
      ref={containerRef}
      tabIndex={-1}
      className="min-h-[100dvh] bg-background text-foreground flex flex-col p-4 max-w-lg mx-auto w-full outline-none"
    >
      {/* Top row: back · ignore · progress bar · mute */}
      <div className="flex items-center gap-3 mb-5 mt-1">
        <button
          onClick={goBack}
          className="shrink-0 p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {confirmingIgnore ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setConfirmingIgnore(false)}
              className="px-3 py-1.5 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleIgnoreConfirm}
              className="px-3 py-1.5 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              Ignore
            </button>
          </div>
        ) : (
          <button
            onClick={handleIgnore}
            className="shrink-0 p-2 rounded-xl bg-muted text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
            aria-label="Ignore this card forever"
            title="Ignore — never show this card again"
          >
            <Ban className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-[#8c3cdd] transition-all duration-400"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <button
          onClick={toggleTts}
          className="shrink-0 p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label={ttsOn ? "Mute sound" : "Unmute sound"}
        >
          {ttsOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
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
