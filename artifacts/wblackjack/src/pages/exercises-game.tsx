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
import { ArrowLeft, Loader2 } from "lucide-react";
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
  | { type: "C"; leftItems: WordCloudItem[]; rightItems: WordCloudTranslation[] }
  | { type: "D"; line: LyricLine; targetWord: string; blankIndex: number };

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
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = LANG_MAP[langName.toLowerCase()] ?? langName;
  window.speechSynthesis.speak(utt);
}

function buildLessons(lyrics: LyricLine[], vocab: VocabEntry[]): Lesson[] {
  const eligible = lyrics.filter((l) => tokenize(l.original).length >= 3);
  if (eligible.length === 0) return [];

  const hasVocab = vocab.length >= 8;
  const typeCount = hasVocab ? 4 : 3;

  const usedByType: Record<"A" | "B" | "D", Set<number>> = {
    A: new Set(), B: new Set(), D: new Set(),
  };

  function pickLine(type: "A" | "B" | "D"): LyricLine {
    const unused = eligible.filter((l) => !usedByType[type].has(l.lineIndex));
    const pool = unused.length > 0 ? unused : eligible;
    const line = pool[Math.floor(Math.random() * pool.length)];
    usedByType[type].add(line.lineIndex);
    return line;
  }

  const lessons: Lesson[] = [];
  for (let i = 0; i < 10; i++) {
    const pick = Math.floor(Math.random() * typeCount);

    if (pick === 0) {
      const line = pickLine("A");
      lessons.push({ type: "A", line, shuffledWords: shuffle(tokenize(line.original)) });
    } else if (pick === 1) {
      const line = pickLine("B");
      const correct = line.translation;
      const csvDistractors = [
        line.distractor1, line.distractor2, line.distractor3, line.distractor4,
      ].filter((d): d is string => typeof d === "string" && d.trim() !== "");
      lessons.push({ type: "B", line, options: shuffle([correct, ...csvDistractors]) });
    } else if (pick === 2 && hasVocab) {
      const selected = shuffle(vocab).slice(0, 8);
      const leftItems: WordCloudItem[] = selected.map((v) => ({ id: v.id, phrase: v.phrase }));
      const rightItems: WordCloudTranslation[] = shuffle(
        selected.map((v) => ({ id: v.id, translation: v.translation }))
      );
      lessons.push({ type: "C", leftItems, rightItems });
    } else {
      // Type D: missing word
      const line = pickLine("D");
      const words = tokenize(line.original);
      const blankIndex = Math.floor(Math.random() * words.length);
      const targetWord = words[blankIndex];
      lessons.push({ type: "D", line, targetWord, blankIndex });
    }
  }
  return lessons;
}

// ─── Shared: Continue on Space/Enter ─────────────────────────────────────────

function useContinueOnKey(enabled: boolean, onContinue: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onContinue]);
}

// ─── Type A: Shuffled Line ────────────────────────────────────────────────────

function LessonTypeA({ lesson, songLanguage, onContinue, isLast }: {
  lesson: Extract<Lesson, { type: "A" }>;
  songLanguage: string;
  onContinue: () => void;
  isLast: boolean;
}) {
  const [placed, setPlaced] = useState<{ word: string; poolId: number }[]>([]);
  const [pool, setPool] = useState<{ word: string; id: number; used: boolean }[]>(
    lesson.shuffledWords.map((w, i) => ({ word: w, id: i, used: false }))
  );
  const [correct, setCorrect] = useState(false);
  const [flash, setFlash] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const placedRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const targetWords = tokenize(lesson.line.original);
  useContinueOnKey(correct, onContinue);
  useEffect(() => { if (correct) speak(lesson.line.original, songLanguage); }, [correct]);

  // Build display order: dragged item removed from source, ghost inserted at dragOverIndex
  const displayItems = useMemo(() => {
    type Item = { word: string; poolId: number; origIdx: number; isGhost: boolean };
    if (dragIndex === null) {
      return placed.map((p, i): Item => ({ ...p, origIdx: i, isGhost: false }));
    }
    const list: Item[] = placed.map((p, i) => ({ ...p, origIdx: i, isGhost: false }));
    const [dragged] = list.splice(dragIndex, 1);
    const insertAt = Math.min(dragOverIndex ?? dragIndex, list.length);
    list.splice(insertAt, 0, { ...dragged, isGhost: true });
    return list;
  }, [placed, dragIndex, dragOverIndex]);

  const checkCorrect = (newPlaced: { word: string; poolId: number }[]) => {
    const stripped = newPlaced.map((p) => stripPunct(p.word));
    const target = targetWords.map(stripPunct);
    if (stripped.length === target.length && stripped.every((w, i) => w.toLowerCase() === target[i].toLowerCase())) {
      setCorrect(true); setFlash(true); setTimeout(() => setFlash(false), 600);
    }
  };

  const handlePickWord = (id: number, word: string) => {
    if (correct) return;
    setPool((prev) => prev.map((p) => p.id === id ? { ...p, used: true } : p));
    const newPlaced = [...placed, { word, poolId: id }];
    setPlaced(newPlaced);
    checkCorrect(newPlaced);
  };

  const handleRemoveWord = (idx: number) => {
    if (correct) return;
    const { poolId } = placed[idx];
    setPlaced((prev) => prev.filter((_, i) => i !== idx));
    setPool((prev) => prev.map((p) => p.id === poolId ? { ...p, used: false } : p));
  };

  const findHoveredDisplayIndex = (clientX: number, clientY: number): number | null => {
    for (let j = 0; j < placedRefs.current.length; j++) {
      const el = placedRefs.current[j];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return j;
    }
    return null;
  };

  const handlePlacedPointerDown = (e: React.PointerEvent<HTMLButtonElement>, origIdx: number) => {
    if (correct) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(origIdx);
    setDragOverIndex(origIdx);
  };

  const handlePlacedPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragIndex === null) return;
    const hovered = findHoveredDisplayIndex(e.clientX, e.clientY);
    if (hovered !== null && hovered !== dragOverIndex) setDragOverIndex(hovered);
  };

  const handlePlacedPointerUp = () => {
    if (dragIndex !== null) {
      if (dragOverIndex !== null && dragOverIndex !== dragIndex) {
        const next = [...placed];
        const [removed] = next.splice(dragIndex, 1);
        next.splice(dragOverIndex, 0, removed);
        setPlaced(next);
        checkCorrect(next);
      } else {
        handleRemoveWord(dragIndex);
      }
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="text-base text-muted-foreground text-center shrink-0 mb-3">Reconstruct the original line</p>
      <div className={`shrink-0 min-h-20 border-2 rounded-xl p-4 flex flex-wrap gap-2 items-center transition-colors mb-2 ${correct ? flash ? "border-green-400 bg-green-400/10" : "border-green-400/50 bg-green-400/5" : "border-border bg-card/50"}`} data-testid="answer-area">
        {correct
          ? <span className="text-green-400 font-medium text-2xl">{lesson.line.original}</span>
          : placed.length === 0
            ? <span className="text-muted-foreground/40 text-base">Click words below to place them here</span>
            : displayItems.map(({ word, origIdx, isGhost }, displayIdx) => (
                <button
                  key={isGhost ? "ghost" : `item-${origIdx}`}
                  ref={(el) => { placedRefs.current[displayIdx] = el; }}
                  onPointerDown={(e) => !isGhost && handlePlacedPointerDown(e, origIdx)}
                  onPointerMove={handlePlacedPointerMove}
                  onPointerUp={handlePlacedPointerUp}
                  className={`px-4 py-2 rounded-lg border font-medium text-[20px] touch-none select-none transition-colors
                    ${isGhost
                      ? "border-2 border-dashed border-primary/50 bg-primary/10 text-primary/60 cursor-grabbing"
                      : "bg-primary/20 border-primary/40 text-white hover:bg-primary/30 cursor-grab"
                    }`}
                  data-testid={`placed-word-${displayIdx}`}
                >
                  {word}
                </button>
              ))
        }
      </div>
      <div className="shrink-0 h-8 flex px-2 mb-2 mt-6 justify-start items-center">
        {correct && (
          <p className="text-[18px] text-left" style={{ color: "#fdb8c8" }}>{lesson.line.translation}</p>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-wrap gap-2 content-start items-start mb-3" data-testid="word-pool">
        {pool.map(({ word, id, used }) => (
          <button
            key={id}
            onClick={() => !used && handlePickWord(id, word)}
            className={`px-4 py-2.5 rounded-lg border font-medium transition-colors text-[20px] ${
              used
                ? "bg-muted/30 border-border/30 text-foreground/30 cursor-default"
                : "bg-muted border-border hover:border-primary/50 hover:bg-muted/70 text-foreground"
            }`}
            data-testid={`pool-word-${id}`}
          >
            {word}
          </button>
        ))}
      </div>
      <Button className="shrink-0 w-full h-14 text-lg font-bold bg-green-500 hover:bg-green-500/90 text-black disabled:opacity-30 disabled:cursor-not-allowed" onClick={onContinue} disabled={!correct} data-testid="btn-continue">
        {isLast ? "Finish" : "Continue"}
      </Button>
    </div>
  );
}

// ─── Type B: Translate ────────────────────────────────────────────────────────

function LessonTypeB({ lesson, songLanguage, onContinue, isLast }: {
  lesson: Extract<Lesson, { type: "B" }>;
  songLanguage: string;
  onContinue: () => void;
  isLast: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const correct = selected === lesson.line.translation;
  useContinueOnKey(correct, onContinue);
  useEffect(() => { speak(lesson.line.original, songLanguage); }, []);

  const handleSelect = (option: string) => {
    if (correct) return;
    if (option === lesson.line.translation) {
      setSelected(option);
    } else {
      setWrongFlash(option);
      setTimeout(() => setWrongFlash(null), 600);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 rounded-xl bg-card border border-border p-4 text-center mb-2">
        <p className="text-2xl font-bold leading-relaxed">{lesson.line.original}</p>
      </div>
      <p className="shrink-0 text-sm text-muted-foreground text-center mb-3">Choose the correct translation</p>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 mb-3">
        {lesson.options.map((opt, i) => {
          const isCorrectSelected = opt === lesson.line.translation && selected === opt;
          const isWrong = wrongFlash === opt;
          return (
            <button key={i} onClick={() => handleSelect(opt)} className={`w-full min-h-14 px-5 py-3 rounded-xl border-2 text-left text-base font-medium transition-all ${isCorrectSelected ? "border-green-400 bg-green-400/10 text-green-300" : isWrong ? "border-pink-500 bg-pink-500/10 text-pink-300 scale-95" : "border-border bg-card hover:border-primary/50 hover:bg-muted text-foreground"}`} data-testid={`btn-option-${i}`}>{opt}</button>
          );
        })}
      </div>
      <Button className="shrink-0 w-full h-14 text-lg font-bold bg-green-500 hover:bg-green-500/90 text-black disabled:opacity-30 disabled:cursor-not-allowed" onClick={onContinue} disabled={!correct} data-testid="btn-continue">
        {isLast ? "Finish" : "Continue"}
      </Button>
    </div>
  );
}

// ─── Type C: Word Cloud ───────────────────────────────────────────────────────

function LessonTypeC({ lesson, songLanguage, onContinue, isLast }: {
  lesson: Extract<Lesson, { type: "C" }>;
  songLanguage: string;
  onContinue: () => void;
  isLast: boolean;
}) {
  const { leftItems, rightItems } = lesson;
  const [selectedLeftPos, setSelectedLeftPos] = useState<number | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<number>>(new Set());
  const [wrongFlash, setWrongFlash] = useState(false);
  const [kbPhase, setKbPhase] = useState<"left" | "right">("left");
  const allMatched = matchedIds.size === leftItems.length;
  useContinueOnKey(allMatched, onContinue);
  const stateRef = useRef({ selectedLeftPos, matchedIds, kbPhase });
  useEffect(() => { stateRef.current = { selectedLeftPos, matchedIds, kbPhase }; });

  const handleLeftClick = (pos: number) => {
    if (matchedIds.has(leftItems[pos].id)) return;
    speak(leftItems[pos].phrase, songLanguage);
    setSelectedLeftPos(pos); setKbPhase("right"); setWrongFlash(false);
  };

  const handleRightClick = (pos: number) => {
    if (matchedIds.has(rightItems[pos].id) || selectedLeftPos === null) return;
    const leftId = leftItems[selectedLeftPos].id;
    const rightId = rightItems[pos].id;
    if (leftId === rightId) {
      setMatchedIds((prev) => new Set([...prev, leftId]));
      setSelectedLeftPos(null); setKbPhase("left"); setWrongFlash(false);
    } else {
      setWrongFlash(true); setTimeout(() => setWrongFlash(false), 600);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") return;
      const { selectedLeftPos, matchedIds, kbPhase } = stateRef.current;
      if (e.key === "Tab") {
        if (selectedLeftPos !== null) { e.preventDefault(); setKbPhase("right"); }
        return;
      }
      const digit = parseInt(e.key, 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;
      const pos = digit - 1;
      if (kbPhase === "left") {
        if (pos < leftItems.length && !matchedIds.has(leftItems[pos].id)) {
          setSelectedLeftPos(pos); setKbPhase("right"); setWrongFlash(false);
        }
      } else {
        if (pos < rightItems.length && !matchedIds.has(rightItems[pos].id) && selectedLeftPos !== null) {
          const leftId = leftItems[selectedLeftPos].id;
          const rightId = rightItems[pos].id;
          if (leftId === rightId) {
            setMatchedIds((prev) => new Set([...prev, leftId]));
            setSelectedLeftPos(null); setKbPhase("left"); setWrongFlash(false);
          } else {
            setWrongFlash(true); setTimeout(() => setWrongFlash(false), 600);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [leftItems, rightItems]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="shrink-0 text-sm text-muted-foreground text-center mb-3">
        Match each word to its translation
        <span className="ml-2 text-xs opacity-60">(click or press 1-9 · Tab · 1-9)</span>
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 mb-3">
        <div className="flex flex-wrap gap-2">
          {leftItems.map((item, pos) => {
            const isMatched = matchedIds.has(item.id);
            const isSelected = selectedLeftPos === pos;
            const isWrong = isSelected && wrongFlash;
            return (
              <button key={item.id} onClick={() => handleLeftClick(pos)} disabled={isMatched} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full border-2 text-base font-medium transition-all ${isMatched ? "border-green-700/40 bg-green-900/20 text-green-600 line-through cursor-default" : isWrong ? "border-red-500 bg-red-500/10 text-red-400 animate-pulse" : isSelected ? "border-primary bg-primary/15 text-primary" : "border-border bg-card hover:border-primary/40 hover:bg-muted text-foreground cursor-pointer"}`} data-testid={`left-${pos}`}>
                <span className="text-xs text-muted-foreground shrink-0">{pos + 1}</span>
                <span>{item.phrase}</span>
              </button>
            );
          })}
        </div>
        <hr className="border-green-500/40 shrink-0" />
        <div className="flex flex-wrap gap-2">
          {rightItems.map((item, pos) => {
            const isMatched = matchedIds.has(item.id);
            return (
              <button key={item.id} onClick={() => handleRightClick(pos)} disabled={isMatched || selectedLeftPos === null} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full border-2 text-base font-medium transition-all ${isMatched ? "border-green-700/40 bg-green-900/20 text-green-600 line-through cursor-default" : selectedLeftPos !== null ? "border-border bg-card hover:border-primary/40 hover:bg-muted text-foreground cursor-pointer" : "border-border bg-card text-foreground opacity-60 cursor-default"}`} data-testid={`right-${pos}`}>
                <span className="text-xs text-muted-foreground shrink-0">{pos + 1}</span>
                <span>{item.translation}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Button className="shrink-0 w-full h-14 text-lg font-bold bg-green-500 hover:bg-green-500/90 text-black disabled:opacity-30 disabled:cursor-not-allowed" onClick={onContinue} disabled={!allMatched} data-testid="btn-continue">
        {isLast ? "Finish" : "Continue"}
      </Button>
    </div>
  );
}

// ─── Type D: Missing Word ─────────────────────────────────────────────────────

function LessonTypeD({ lesson, songLanguage, onContinue, isLast }: {
  lesson: Extract<Lesson, { type: "D" }>;
  songLanguage: string;
  onContinue: () => void;
  isLast: boolean;
}) {
  const { line, targetWord, blankIndex } = lesson;
  const words = tokenize(line.original);

  const [selected, setSelected] = useState<string | null>(null);
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const correct = selected !== null && stripPunct(selected).toLowerCase() === stripPunct(targetWord).toLowerCase();
  useContinueOnKey(correct, onContinue);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    setLoadError(false);

    fetch("/api/songs/distractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word: targetWord,
        line: line.original,
        language: songLanguage,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const distractors: string[] = Array.isArray(data.distractors) ? data.distractors : [];
        setOptions(shuffle([targetWord, ...distractors.slice(0, 5)]));
        setLoadingOptions(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: use surrounding words as crude distractors
        const fallback = shuffle(
          words.filter((w) => stripPunct(w).toLowerCase() !== stripPunct(targetWord).toLowerCase())
        ).slice(0, 5);
        setOptions(shuffle([targetWord, ...fallback]));
        setLoadingOptions(false);
        setLoadError(true);
      });

    return () => { cancelled = true; };
  }, []);

  const handleSelect = (opt: string) => {
    if (correct) return;
    if (stripPunct(opt).toLowerCase() === stripPunct(targetWord).toLowerCase()) {
      setSelected(opt);
      speak(line.original, songLanguage);
    } else {
      setWrongFlash(opt);
      setTimeout(() => setWrongFlash(null), 600);
    }
  };

  // Render the line with blank or filled word
  const renderedLine = words.map((w, i) => {
    if (i !== blankIndex) return w;
    if (correct) return <span key={i} className="text-green-400 font-bold">{w}</span>;
    return <span key={i} className="inline-block border-b-2 border-primary px-2 min-w-[3rem] text-center text-primary">{"_____"}</span>;
  });

  const lineWithSpaces = renderedLine.reduce<React.ReactNode[]>((acc, el, i) => {
    if (i > 0) acc.push(" ");
    acc.push(el);
    return acc;
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="shrink-0 text-sm text-muted-foreground text-center mb-3">Fill in the missing word</p>

      {/* Line display */}
      <div className="shrink-0 rounded-xl bg-card border border-border p-5 text-center mb-4">
        <p className="text-xl font-semibold leading-relaxed">{lineWithSpaces}</p>
        <p className="text-sm mt-2" style={{ color: "#fdb8c8" }}>{line.translation}</p>
      </div>

      {/* Options */}
      {loadingOptions ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-3 mb-3 content-start">
          {loadError && (
            <p className="col-span-2 text-xs text-muted-foreground text-center mb-1 opacity-60">
              (using fallback distractors)
            </p>
          )}
          {options.map((opt, i) => {
            const isCorrectSelected = correct && stripPunct(opt).toLowerCase() === stripPunct(targetWord).toLowerCase();
            const isWrong = wrongFlash === opt;
            return (
              <button
                key={i}
                onClick={() => handleSelect(opt)}
                className={`w-full min-h-14 px-4 py-3 rounded-xl border-2 text-base font-medium transition-all ${
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
      )}

      <Button
        className="shrink-0 w-full h-14 text-lg font-bold bg-green-500 hover:bg-green-500/90 text-black disabled:opacity-30 disabled:cursor-not-allowed"
        onClick={onContinue}
        disabled={!correct}
        data-testid="btn-continue"
      >
        {isLast ? "Finish" : "Continue"}
      </Button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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
    return <div className="min-h-[100dvh] flex items-center justify-center text-muted-foreground">Loading...</div>;

  if (!song || !lyrics || lessons.length === 0)
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground text-center">No lyrics found — add lyrics from the Song Lab to play exercises.</p>
        <Link href={`/song/${id}`}><Button variant="outline">Back to Song</Button></Link>
      </div>
    );

  const currentLesson = lessons[lesson];
  const badgeLabel =
    currentLesson.type === "A" ? "Shuffled Line" :
    currentLesson.type === "B" ? "Translate" :
    currentLesson.type === "C" ? "Match" : "Missing Word";

  return (
    <div className="h-full flex flex-col bg-background p-4 max-w-lg mx-auto w-full overflow-hidden">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <Link href={`/song/${id}`} className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors" data-testid="link-back">
          <ArrowLeft className="w-7 h-7" />
        </Link>
        <div className="font-bold text-primary bg-primary/10 px-4 py-1 rounded-full border border-primary/20">
          Lesson {lesson + 1} / 10
        </div>
        <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{badgeLabel}</div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {currentLesson.type === "A" ? (
          <LessonTypeA key={key} lesson={currentLesson} songLanguage={song.language ?? ""} onContinue={handleContinue} isLast={lesson === 9} />
        ) : currentLesson.type === "B" ? (
          <LessonTypeB key={key} lesson={currentLesson} songLanguage={song.language ?? ""} onContinue={handleContinue} isLast={lesson === 9} />
        ) : currentLesson.type === "C" ? (
          <LessonTypeC key={key} lesson={currentLesson} songLanguage={song.language ?? ""} onContinue={handleContinue} isLast={lesson === 9} />
        ) : (
          <LessonTypeD key={key} lesson={currentLesson} songLanguage={song.language ?? ""} onContinue={handleContinue} isLast={lesson === 9} />
        )}
      </div>
    </div>
  );
}
