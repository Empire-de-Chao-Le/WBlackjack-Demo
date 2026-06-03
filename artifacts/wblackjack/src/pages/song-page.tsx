import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import {
  useGetSong,
  useGetSongLyrics,
  getGetSongQueryKey,
  getGetSongLyricsQueryKey,
  getListSongsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, Brain, Pencil, BookOpen, Languages, ScrollText } from "lucide-react";
import { getLanguageFlag } from "@/lib/helpers";
import { SyncTool } from "@/components/sync-tool";

export default function SongPage() {
  const [, params] = useRoute("/song/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const { data: song, isLoading } = useGetSong(id, { query: { enabled: !!id, queryKey: getGetSongQueryKey(id) } });

  const needsSync = song?.hasTimestamps === false;

  // Pre-fetch lyrics for unsynced songs so the SyncTool can open immediately
  const { data: lyrics } = useGetSongLyrics(id, {
    query: { enabled: !!id && needsSync, queryKey: getGetSongLyricsQueryKey(id) },
  });

  useAndroidBack(() => {
    if (isSyncing) setIsSyncing(false);
    else setLocation("/");
  });

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!song) return <div className="p-8 text-center text-destructive">Song not found.</div>;

  // Show SyncTool overlay when user initiates sync from the Karaoke button
  if (isSyncing) {
    if (!lyrics) {
      return (
        <div className="h-[100dvh] flex items-center justify-center text-muted-foreground">
          Loading lyrics…
        </div>
      );
    }
    return (
      <SyncTool
        artist={song.artist}
        title={song.title}
        youtubeUrl={song.youtubeUrl}
        language={song.language}
        existingSongId={song.id}
        lines={(lyrics as unknown as Array<{
          lineIndex: number;
          original: string;
          translation?: string;
          distractor1?: string;
          distractor2?: string;
          distractor3?: string;
          distractor4?: string;
        }>).map((l) => ({
          lineIndex: l.lineIndex,
          original: l.original,
          translation: l.translation ?? "",
          distractor1: l.distractor1 ?? "",
          distractor2: l.distractor2 ?? "",
          distractor3: l.distractor3 ?? "",
          distractor4: l.distractor4 ?? "",
        }))}
        onExit={() => setIsSyncing(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: getGetSongQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
          setIsSyncing(false);
        }}
      />
    );
  }

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
        {needsSync ? (
          <button
            onClick={() => setIsSyncing(true)}
            className="w-full h-24 text-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg rounded-lg flex items-center justify-center gap-3 relative"
            data-testid="btn-karaoke"
          >
            <Mic className="w-6 h-6" />
            Karaoke
            <span className="absolute top-2 right-3 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full leading-5">
              Not synced — tap to sync
            </span>
          </button>
        ) : (
          <Link href={`/song/${song.id}/karaoke`} className="block">
            <Button size="lg" className="w-full h-24 text-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg flex items-center justify-center gap-3" data-testid="btn-karaoke">
              <Mic className="w-6 h-6" />
              Karaoke
            </Button>
          </Link>
        )}
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
