import { useRoute, useLocation } from "wouter";
import { useGetSong, useGetSongLyrics, getGetSongQueryKey } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { useAndroidBack } from "@/hooks/useAndroidBack";

export default function SongTranslation() {
  const [, params] = useRoute("/song/:id/translation");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  useAndroidBack(() => setLocation(`/song/${id}`));

  const { data: song } = useGetSong(id, {
    query: { enabled: !!id, queryKey: getGetSongQueryKey(id) },
  });

  const { data: lyrics, isLoading } = useGetSongLyrics(id, {
    query: { enabled: !!id },
  });

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 max-w-lg mx-auto w-full pb-12">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => setLocation(`/song/${id}`)}
          className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-7 h-7" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Translation</h1>
          {song && (
            <p className="text-sm text-muted-foreground">
              {song.artist} — {song.title}
            </p>
          )}
        </div>
      </div>
      {isLoading && (
        <p className="text-center text-muted-foreground mt-8">Loading…</p>
      )}
      {!isLoading && (!lyrics || lyrics.length === 0) && (
        <p className="text-center text-muted-foreground mt-8">
          No lyrics added for this song yet.
        </p>
      )}
      {lyrics && lyrics.length > 0 && (
        <div className="space-y-6">
          {lyrics.map((line) => (
            <div key={line.lineIndex} className="space-y-1">
              <p className="text-xl font-semibold text-white leading-snug">
                {line.original}
              </p>
              <p className="text-[16px]" style={{ color: "#fdb8c8" }}>
                {line.translation}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
