import { useState } from "react";
import { useListLanguages } from "@workspace/api-client-react";
import { useWordPoolStats } from "@/hooks/useWordPoolStats";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getLanguageFlag } from "@/lib/helpers";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search } from "lucide-react";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

// ── word pool modal ───────────────────────────────────────────────────────────

function WordPoolModal({
  language,
  onClose,
}: {
  language: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const { data: entries, isLoading } = useWordPool(language);
  useAndroidBack(onClose);

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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) { setSearch(""); onClose(); } }}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 p-0 max-h-[85dvh] sm:max-w-lg">
        {/* ── header ── */}
        <DialogHeader className="px-4 pt-3 pb-3 shrink-0">
          <button
            onClick={() => { setSearch(""); onClose(); }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors self-start mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="text-3xl leading-none">{getLanguageFlag(language)}</span>
            <span className="capitalize">{language}</span>
            {entries && (
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {activeCount} active
                {ignoredCount > 0 && `, ${ignoredCount} ignored`}
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
              {filtered.map((entry) => (
                <li
                  key={entry.id}
                  className={
                    entry.ignored
                      ? "py-2 text-muted-foreground/50"
                      : "py-2"
                  }
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-sm font-medium ${entry.ignored ? "" : "text-foreground"}`}>
                      {entry.phrase}
                    </span>
                    <span className="text-xs shrink-0 text-right">
                      {entry.translation}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
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
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card hover:bg-muted/60 hover:border-primary/40 transition-all p-6 aspect-square shadow-sm active:scale-95"
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
