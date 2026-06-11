import { Link, useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useGetSongLyrics } from "@workspace/api-client-react";
import { tokenize } from "@/lib/helpers";
import { RewardSpiral, type KaraokeTier } from "@/components/reward-spiral";

type KaraokeResultRow = { difficulty: number; tier: KaraokeTier; count: number };

const DIFFICULTIES = [10, 33, 100] as const;

const TIER_STACK: KaraokeTier[] = ["perfect", "high", "normal"];

const DIFFICULTY_PATTERN: Record<number, boolean[]> = {
  10:  [false, false, false, false, false, true,  false],
  33:  [false, false, true,  false, false, false, true ],
  100: [true,  true,  true,  true,  true,  true,  true ],
};

export default function KaraokePicker() {
  const [, params] = useRoute("/song/:id/karaoke");
  const [, setLocation] = useLocation();
  const id = params?.id;
  const numericId = parseInt(id || "0", 10);
  useAndroidBack(() => setLocation(`/song/${id}`));

  const { data: lyrics } = useGetSongLyrics(numericId, {
    query: { enabled: !!numericId },
  });

  const { data: results } = useQuery({
    queryKey: ["karaoke-results", numericId],
    queryFn: async () => {
      const res = await fetch(`/api/karaoke/results/${numericId}`);
      if (!res.ok) throw new Error("Failed to load karaoke results");
      return res.json() as Promise<KaraokeResultRow[]>;
    },
    enabled: !!numericId,
  });

  const totalWords = lyrics
    ? lyrics.reduce((sum, l) => sum + tokenize(l.original).length, 0)
    : null;

  const countFor = (difficulty: number, tier: KaraokeTier): number =>
    results?.find((r) => r.difficulty === difficulty && r.tier === tier)?.count ?? 0;

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 max-w-lg mx-auto w-full gap-8">
      <div className="flex items-center gap-4">
        <Link href={`/song/${id}`} className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors" data-testid="link-back">
          <ArrowLeft className="w-7 h-7" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Select Difficulty</h1>
          {totalWords !== null && (
            <p className="text-sm text-muted-foreground mt-0.5">{totalWords} words total</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-8">
        {DIFFICULTIES.map((difficulty) => (
          <Link key={difficulty} href={`/song/${id}/karaoke/${difficulty}`} className="block">
            <Button
              size="lg"
              className="w-full h-24 text-2xl font-bold hover:bg-muted border border-primary-border bg-[#8c3cdde6] relative"
              data-testid={`btn-diff-${difficulty}`}
            >
              {/* Difficulty label — always centred */}
              <span className="absolute inset-0 flex items-center justify-center gap-[5px]">
                {DIFFICULTY_PATTERN[difficulty].map((filled, i) => (
                  <span
                    key={i}
                    className="inline-block rounded-full flex-shrink-0"
                    style={{
                      width: 18,
                      height: 18,
                      background: filled ? "#2d0a5e" : "rgba(255,255,255,0.78)",
                    }}
                  />
                ))}
              </span>

              {/* Reward stack — 3 fixed equal-height slots, top=perfect, mid=high, bot=normal */}
              <div className="absolute right-3 top-0 bottom-0 flex flex-col pointer-events-none">
                {TIER_STACK.map((tier) => {
                  const count = countFor(difficulty, tier);
                  return (
                    <div
                      key={tier}
                      className="flex-1 flex items-center justify-end"
                    >
                      {count > 0 ? (
                        <span className="flex items-center gap-0.5 text-sm font-bold leading-none">
                          <span>{count}</span>
                          <RewardSpiral tier={tier} className="text-xl" />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}
