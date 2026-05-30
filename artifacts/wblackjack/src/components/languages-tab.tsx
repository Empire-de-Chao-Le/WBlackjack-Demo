import { useListLanguages } from "@workspace/api-client-react";
import { useWordPoolStats } from "@/hooks/useWordPoolStats";
import { useLocation } from "wouter";
import { getLanguageFlag } from "@/lib/helpers";

export function LanguagesTab() {
  const { data: languages, isLoading } = useListLanguages();
  const { data: stats } = useWordPoolStats();
  const [, setLocation] = useLocation();

  const countMap = new Map(stats?.map((s) => [s.language, s.count]) ?? []);

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
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-2">
      {languages.map((lang) => {
        const count = countMap.get(lang);
        return (
          <button
            key={lang}
            onClick={() => setLocation(`/flashcards/${encodeURIComponent(lang)}`)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card hover:bg-muted/60 hover:border-primary/40 transition-all p-6 aspect-square shadow-sm active:scale-95"
          >
            <span className="text-6xl leading-none">{getLanguageFlag(lang)}</span>
            <span className="text-base font-semibold capitalize text-foreground">{lang}</span>
            {count !== undefined && (
              <span className="text-xs text-muted-foreground">
                {count} {count === 1 ? "word" : "words"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
