import { Link, useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useGetSongLyrics } from "@workspace/api-client-react";
import { tokenize } from "@/lib/helpers";
import { RewardSpiral, TIER_ORDER, type KaraokeTier } from "@/components/reward-spiral";

type KaraokeResultRow = { difficulty: number; tier: KaraokeTier; count: number };

const DIFFICULTIES = [10, 33, 100] as const;

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

  // Index counts by `${difficulty}-${tier}` for quick lookup per button.
  const countFor = (difficulty: number, tier: KaraokeTier): number =>
    results?.find((r) => r.difficulty === difficulty && r.tier === tier)?.count ?? 0;

  const badgesFor = (difficulty: number) =>
    TIER_ORDER.map((tier) => ({ tier, count: countFor(difficulty, tier) })).filter(
      (b) => b.count > 0
    );

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
        {DIFFICULTIES.map((difficulty) => {
          const badges = badgesFor(difficulty);
          return (
            <Link key={difficulty} href={`/song/${id}/karaoke/${difficulty}`} className="block">
              <Button
                size="lg"
                className="w-full h-24 text-2xl font-bold hover:bg-muted border border-border bg-[#8c3cdde6] flex flex-col items-center justify-center gap-1.5"
                data-testid={`btn-diff-${difficulty}`}
              >
                <span>{difficulty}%</span>
                {badges.length > 0 && (
                  <div className="flex items-center gap-4">
                    {badges.map((b) => (
                      <span key={b.tier} className="flex items-center gap-1 text-base">
                        <RewardSpiral tier={b.tier} className="text-2xl" />
                        <span className="font-bold">x{b.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
