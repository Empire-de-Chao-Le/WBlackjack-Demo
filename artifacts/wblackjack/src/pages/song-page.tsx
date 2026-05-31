import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { useGetSong, useGetSongLyrics, getGetSongQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, Brain, Pencil, BookOpen, Languages, ScrollText } from "lucide-react";
import { getLanguageFlag } from "@/lib/helpers";

export default function SongPage() {
  const [, params] = useRoute("/song/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  const { data: song, isLoading } = useGetSong(id, { query: { enabled: !!id, queryKey: getGetSongQueryKey(id) } });
  useAndroidBack(() => setLocation("/"));

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!song) return <div className="p-8 text-center text-destructive">Song not found.</div>;

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 max-w-lg mx-auto w-full gap-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors" data-testid="link-back">
          <ArrowLeft className="w-7 h-7" />
        </Link>
        <span className="text-5xl leading-none">{getLanguageFlag(song.language)}</span>
        <button
          onClick={() => setLocation(`/song/${id}/edit`)}
          className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label="Edit song"
          data-testid="btn-edit-song"
        >
          <Pencil className="w-7 h-7" />
        </button>
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-song-title">{song.title}</h1>
        <p className="text-[#a39daf] text-[24px] font-bold">{song.artist}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 mt-4">
        <Link href={`/song/${song.id}/karaoke`} className="block">
          <Button size="lg" className="w-full h-24 text-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg flex items-center justify-center gap-3" data-testid="btn-karaoke">
            <Mic className="w-6 h-6" />
            Karaoke
          </Button>
        </Link>
        <Link href={`/song/${song.id}/exercises`} className="block">
          <Button size="lg" className="w-full h-24 text-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg flex items-center justify-center gap-3" data-testid="btn-exercises">
            <Brain className="w-6 h-6" />
            Exercises
          </Button>
        </Link>
        <div className="grid grid-cols-3 gap-3">
          <Link href={`/song/${song.id}/lyrics`} className="block">
            <Button variant="outline" size="lg" className="w-full h-14 font-medium flex items-center justify-center gap-2" data-testid="btn-lyrics">
              <ScrollText className="w-5 h-5" />
              Lyrics
            </Button>
          </Link>
          <Link href={`/song/${song.id}/vocab`} className="block">
            <Button variant="outline" size="lg" className="w-full h-14 font-medium flex items-center justify-center gap-2" data-testid="btn-vocab">
              <BookOpen className="w-5 h-5" />
              Vocab
            </Button>
          </Link>
          <Link href={`/song/${song.id}/translation`} className="block">
            <Button variant="outline" size="lg" className="w-full h-14 font-medium flex items-center justify-center gap-2" data-testid="btn-translation">
              <Languages className="w-5 h-5" />
              Translation
            </Button>
          </Link>
        </div>
      </div>
      <p className="text-[16px] text-[#a39daf]">
        Added {new Date(song.dateAdded).toLocaleDateString()}
        {song.lastPlayed
          ? ` · Played ${new Date(song.lastPlayed).toLocaleDateString()}`
          : ""}
        {song.timesPlayed > 0 ? ` · ${song.timesPlayed}×` : ""}
      </p>
    </div>
  );
}
