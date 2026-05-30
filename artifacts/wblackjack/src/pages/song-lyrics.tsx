import { useRoute, useLocation } from "wouter";
import { useGetSong, useGetSongLyrics, getGetSongQueryKey, getGetSongLyricsQueryKey } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";

export default function SongLyrics() {
  const [, params] = useRoute("/song/:id/lyrics");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);

  const { data: song } = useGetSong(id, {
    query: { enabled: !!id, queryKey: getGetSongQueryKey(id) },
  });

  const { data: lyrics, isLoading } = useGetSongLyrics(id, {
    query: { enabled: !!id, queryKey: getGetSongLyricsQueryKey(id) },
  });

  const lines = lyrics?.lyrics
    ? lyrics.lyrics.split("\n")
    : [];

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 max-w-lg mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setLocation(`/song/${id}`)}
          className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-7 h-7" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Lyrics</h1>
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

      {!isLoading && lines.length === 0 && (
        <p className="text-center text-muted-foreground mt-8">
          No lyrics added for this song yet.
        </p>
      )}

      {lines.length > 0 && (
        <div className="flex flex-col gap-1">
          {lines.map((line, i) => (
            <p
              key={i}
              className={
                line.trim() === ""
                  ? "h-4"
                  : "text-[20px] leading-snug text-foreground"
              }
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
