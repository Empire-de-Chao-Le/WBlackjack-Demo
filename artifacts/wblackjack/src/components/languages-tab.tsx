import { useState } from "react";
import { useListLanguages } from "@workspace/api-client-react";
import { getLanguageFlag } from "@/lib/helpers";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LanguagesTab() {
  const { data: languages, isLoading } = useListLanguages();
  const [selected, setSelected] = useState<string | null>(null);

  if (selected) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-6 py-16">
        <button
          onClick={() => setSelected(null)}
          className="self-start p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-7 h-7" />
        </button>
        <div className="flex flex-col items-center gap-4 mt-8">
          <span className="text-8xl">{getLanguageFlag(selected)}</span>
          <h2 className="text-2xl font-bold capitalize">{selected}</h2>
          <p className="text-4xl font-bold text-primary mt-4">Flashcards on the way!</p>
          <p className="text-muted-foreground text-center max-w-xs">
            This feature is coming soon. Stay tuned!
          </p>
        </div>
      </div>
    );
  }

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
      {languages.map((lang) => (
        <button
          key={lang}
          onClick={() => setSelected(lang)}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card hover:bg-muted/60 hover:border-primary/40 transition-all p-6 aspect-square shadow-sm active:scale-95"
        >
          <span className="text-6xl leading-none">{getLanguageFlag(lang)}</span>
          <span className="text-base font-semibold capitalize text-foreground">{lang}</span>
        </button>
      ))}
    </div>
  );
}
