import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetSong, getGetSongQueryKey } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";

type VocabEntry = { id: number; songId: number; phrase: string; translation: string };

export default function SongVocab() {
  const [, params] = useRoute("/song/:id/vocab");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);

  const { data: song } = useGetSong(id, {
    query: { enabled: !!id, queryKey: getGetSongQueryKey(id) },
  });

  const { data: vocab, isLoading } = useQuery({
    queryKey: ["song-vocab", id],
    queryFn: async (): Promise<VocabEntry[]> => {
      const res = await fetch(`/api/songs/${id}/vocab`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  return (
    <div className="h-[100dvh] flex flex-col p-4 max-w-lg mx-auto w-full">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <button
          onClick={() => setLocation(`/song/${id}`)}
          className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-7 h-7" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Vocab</h1>
          {song && (
            <p className="text-sm text-muted-foreground">
              {song.artist} — {song.title}
            </p>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-center text-muted-foreground mt-8">Loading…</p>
        )}
        {!isLoading && (!vocab || vocab.length === 0) && (
          <p className="text-center text-muted-foreground mt-8">
            No vocab added for this song yet.
          </p>
        )}
        {vocab && vocab.length > 0 && (
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {vocab.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
              >
                <span className="font-medium text-foreground text-[20px]">{entry.phrase}</span>
                <span className="text-muted-foreground text-right ml-6 text-[20px]">
                  {entry.translation}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
