import { useState, useRef, useLayoutEffect } from "react";
import { useListLanguages } from "@workspace/api-client-react";
import { useWordPoolStats } from "@/hooks/useWordPoolStats";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getLanguageFlag } from "@/lib/helpers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, Trash2, X } from "lucide-react";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// ── helpers ──────────────────────────────────────────────────────────────────

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// ── word pool hook ────────────────────────────────────────────────────────────

type PoolEntry = {
  id: number;
  language: string;
  phrase: string;
  translation: string;
  ignored: boolean;
};

function useWordPool(language: string | null) {
  return useQuery<PoolEntry[]>({
    queryKey: ["word-pool", language],
    queryFn: async () => {
      const res = await fetch(`/api/word-pool/${encodeURIComponent(language!)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!language,
    staleTime: 30_000,
  });
}

// ── selected words preview (two-line clamp + "…and X more") ───────────────────

function SelectedWordsPreview({ words }: { words: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [shownCount, setShownCount] = useState(words.length);

  const buildText = (n: number): string => {
    if (n >= words.length) return words.join(", ");
    const head = words.slice(0, n).join(", ");
    const more = `…and ${words.length - n} more`;
    return head ? `${head}, ${more}` : more;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || words.length === 0) {
      setShownCount(words.length);
      return;
    }

    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16;
    const maxHeight = lineHeight * 2 + 2;

    const fits = (n: number): boolean => {
      el.textContent = buildText(n);
      return el.scrollHeight <= maxHeight;
    };

    let best: number;
    if (fits(words.length)) {
      best = words.length;
    } else {
      let lo = 0;
      let hi = words.length - 1;
      best = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (fits(mid)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
    }
    setShownCount(best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  return (
    <p
      ref={ref}
      className="text-xs text-muted-foreground leading-snug break-words"
    >
      {buildText(shownCount)}
    </p>
  );
}

// ── word pool modal ───────────────────────────────────────────────────────────

function WordPoolModal({
  language,
  onClose,
}: {
  language: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: entries, isLoading } = useWordPool(language);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch(`/api/word-pool/delete-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["word-pool", language] });
      queryClient.invalidateQueries({ queryKey: ["word-pool-stats"] });
    },
  });

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function handleBack() {
    setSearch("");
    exitSelectionMode();
    onClose();
  }

  useAndroidBack(() => {
    if (confirmOpen) {
      setConfirmOpen(false);
      return;
    }
    if (selectionMode) {
      exitSelectionMode();
      return;
    }
    handleBack();
  });

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectButton() {
    // In selection mode: clear selection + exit (never deletes).
    // In viewing mode: enter selection mode.
    if (selectionMode) exitSelectionMode();
    else setSelectionMode(true);
  }

  async function handleConfirmDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    await deleteMutation.mutateAsync(ids);
    setConfirmOpen(false);
    exitSelectionMode();
  }

  const needle = stripDiacritics(search.trim());

  const filtered = entries
    ? needle
      ? entries.filter(
          (e) =>
            stripDiacritics(e.phrase).includes(needle) ||
            stripDiacritics(e.translation).includes(needle)
        )
      : entries
    : [];

  const activeCount = entries?.filter((e) => !e.ignored).length ?? 0;
  const ignoredCount = entries?.filter((e) => e.ignored).length ?? 0;

  // Selected entries resolved from the FULL list so selection survives search.
  const selectedEntries = (entries ?? []).filter((e) => selectedIds.has(e.id));
  const selectedWords = selectedEntries.map((e) => e.phrase);
  const hasSelection = selectedIds.size > 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleBack(); }}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 p-0 max-h-[85dvh] sm:max-w-lg">
        {/* ── header ── */}
        <DialogHeader className="px-4 pt-3 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={handleSelectButton}
              className={`text-sm font-medium transition-colors ${
                selectionMode
                  ? "text-primary hover:text-primary/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {selectionMode ? "Done" : "Select"}
            </button>
          </div>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="text-3xl leading-none">{getLanguageFlag(language)}</span>
            <span className="capitalize">{language}</span>
            {entries && (
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {selectionMode
                  ? `${selectedIds.size} selected`
                  : `${activeCount} active${ignoredCount > 0 ? `, ${ignoredCount} ignored` : ""}`}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── sticky search ── */}
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search words or translations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── list ── */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {search ? "No matches." : "No words in pool yet."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((entry) => {
                const isSelected = selectedIds.has(entry.id);
                return (
                  <li key={entry.id}>
                    <div
                      onClick={selectionMode ? () => toggleSelect(entry.id) : undefined}
                      role={selectionMode ? "button" : undefined}
                      aria-pressed={selectionMode ? isSelected : undefined}
                      className={`flex items-baseline justify-between gap-3 py-2 -mx-2 px-2 rounded-md transition-colors ${
                        entry.ignored ? "text-muted-foreground/50" : ""
                      } ${
                        selectionMode ? "cursor-pointer" : ""
                      } ${
                        isSelected ? "bg-primary/15 ring-1 ring-primary/40" : selectionMode ? "hover:bg-muted/50" : ""
                      }`}
                    >
                      <span className={`text-sm font-medium ${entry.ignored ? "" : "text-foreground"}`}>
                        {entry.phrase}
                      </span>
                      <span className="text-xs shrink-0 text-right">
                        {entry.translation}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── selection bottom bar (sticky) ── */}
        {selectionMode && (
          <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur px-5 pt-3 pb-4">
            <div className="mb-3">
              {hasSelection ? (
                <SelectedWordsPreview words={selectedWords} />
              ) : (
                <p className="text-xs text-muted-foreground/60 min-h-[2.25rem] leading-snug">
                  Tap entries to select them.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={!hasSelection}
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="w-4 h-4" />
                Clear selection
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={!hasSelection}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
                Delete selected
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {/* ── delete confirmation ── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="flex flex-col max-h-[85dvh]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedEntries.length} {selectedEntries.length === 1 ? "entry" : "entries"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the following from the word pool. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {selectedEntries.map((entry) => (
              <div key={entry.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="text-sm font-medium text-foreground">{entry.phrase}</span>
                <span className="text-xs text-muted-foreground shrink-0 text-right">{entry.translation}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleConfirmDelete(); }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function LanguagesTab() {
  const { data: languages, isLoading } = useListLanguages();
  const { data: stats } = useWordPoolStats();
  const [, setLocation] = useLocation();
  const [poolLang, setPoolLang] = useState<string | null>(null);

  const countMap = new Map(stats?.map((s) => [s.language, s.count]) ?? []);
  const worldCount = stats ? stats.reduce((sum, s) => sum + s.count, 0) : undefined;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!languages || languages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        No languages in your library yet.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-2">
        {/* The World — always first; no word pool view */}
        <button
          onClick={() => setLocation("/flashcards/world")}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card hover:bg-muted/60 hover:border-primary/40 transition-all p-6 aspect-square shadow-sm active:scale-95 pl-[12px] pr-[12px] pt-[0px] pb-[0px]"
        >
          <span className="text-[58px]">🌍</span>
          <span className="font-semibold capitalize text-foreground text-[19px]">The World</span>
          {worldCount !== undefined && (
            <span className="text-muted-foreground text-[14px]">
              {worldCount} words of Babylonian Chaos!
            </span>
          )}
        </button>

        {/* Per-language tiles */}
        {languages.map((lang) => {
          const count = countMap.get(lang);
          return (
            <div
              key={lang}
              className="relative aspect-square rounded-2xl border border-border shadow-sm overflow-hidden bg-[#faf7ff] dark:bg-[#181322] hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className="absolute inset-0 flex flex-col">
                {/* Clickable top: flag + name + count starts flashcards */}
                <button
                  onClick={() => setLocation(`/flashcards/${encodeURIComponent(lang)}`)}
                  className="flex-1 flex flex-col items-center justify-center gap-1 px-3 hover:bg-primary/5 active:bg-primary/10 transition-colors"
                >
                  <span className="text-[58px]">{getLanguageFlag(lang)}</span>
                  <span className="font-semibold capitalize text-foreground text-[19px]">{lang}</span>
                  {count !== undefined && (
                    <span className="text-muted-foreground text-[14px]">
                      {count} {count === 1 ? "word" : "words"}
                    </span>
                  )}
                </button>

                {/* Bottom: "Take a look" stretched across the full width */}
                <button
                  onClick={() => setPoolLang(lang)}
                  className="shrink-0 w-full py-3 font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors border-t border-border text-[16px] pt-[8px] pb-[8px]"
                >
                  Take a look
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {poolLang !== null && <WordPoolModal language={poolLang} onClose={() => setPoolLang(null)} />}
    </>
  );
}
