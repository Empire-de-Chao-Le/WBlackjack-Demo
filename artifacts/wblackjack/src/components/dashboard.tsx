import { useState, useEffect } from "react";
import {
  useListSongs,
  useListArtists,
  useListLanguages,
  useUpdateSong,
  useDeleteSong,
  getListSongsQueryKey,
} from "@workspace/api-client-react";
import { getLanguageFlag, normalizeString } from "@/lib/helpers";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Search, X, Trash2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type SortOption =
  | "date_added_desc"
  | "date_added_asc"
  | "last_played_desc"
  | "last_played_asc"
  | "title_asc"
  | "title_desc";

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
  return match ? match[1] : url;
}

function progressColor(timesPlayed: number, status: string): string {
  if (status === "done") return "#4DFF9A";
  const clamped = Math.min(timesPlayed, 12);
  const t = clamped / 12;
  const r = Math.round(255 - t * (255 - 75));
  const g = Math.round(77 - t * 77);
  const b = Math.round(141 + t * (130 - 141));
  return `rgb(${r},${g},${b})`;
}

interface DashboardProps {
  onFilteredSongsChange?: (ids: number[]) => void;
}

export function Dashboard({ onFilteredSongsChange }: DashboardProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [status, setStatus] = useState<"all" | "new" | "active" | "done">("all");
  const [language, setLanguage] = useState<string>("all");
  const [artist, setArtist] = useState<string>("all");
  const [sort, setSort] = useState<SortOption>("date_added_desc");

  const { data: languages } = useListLanguages();
  const { data: artists } = useListArtists();
  const { data: songs, isLoading } = useListSongs({
    status: status === "all" ? undefined : status,
    language: language === "all" ? undefined : language,
    artist: artist === "all" ? undefined : artist,
    sort,
  });

  const updateSong = useUpdateSong();
  const deleteSong = useDeleteSong();

  const filteredSongs = search.trim()
    ? songs?.filter(
        (s) =>
          normalizeString(s.title.toLowerCase()).includes(
            normalizeString(search.toLowerCase())
          ) ||
          normalizeString(s.artist.toLowerCase()).includes(
            normalizeString(search.toLowerCase())
          )
      )
    : songs;

  useEffect(() => {
    onFilteredSongsChange?.(filteredSongs?.map((s) => s.id) ?? []);
  }, [filteredSongs]);

  return (
    <div className="flex flex-col gap-4" data-testid="dashboard-container">
      <div className="flex flex-wrap gap-2 bg-card/60 p-2 rounded-xl border border-border/60 justify-center items-center">
        <button
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          onClick={() => setSearchOpen((o) => !o)}
          data-testid="btn-toggle-search"
        >
          {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>

        {searchOpen && (
          <Input
            autoFocus
            placeholder="Search title or artist..."
            className="flex-1 min-w-[140px] h-8 text-sm bg-input border-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
          />
        )}

        <Select value={language} onValueChange={setLanguage} data-testid="select-language">
          <SelectTrigger className="h-8 w-[130px] text-xs bg-input border-none">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            {languages?.map((l) => (
              <SelectItem key={l} value={l}>
                {getLanguageFlag(l)} {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={artist} onValueChange={setArtist} data-testid="select-artist">
          <SelectTrigger className="h-8 w-[130px] text-xs bg-input border-none">
            <SelectValue placeholder="Artist" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Artists</SelectItem>
            {artists?.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)} data-testid="select-status">
          <SelectTrigger className="h-8 w-[100px] text-xs bg-input border-none">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortOption)} data-testid="select-sort">
          <SelectTrigger className="h-8 w-[140px] text-xs bg-input border-none">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_added_desc">Last Added ↓</SelectItem>
            <SelectItem value="date_added_asc">Last Added ↑</SelectItem>
            <SelectItem value="last_played_desc">Last Played ↓</SelectItem>
            <SelectItem value="last_played_asc">Last Played ↑</SelectItem>
            <SelectItem value="title_asc">Title A→Z</SelectItem>
            <SelectItem value="title_desc">Title Z→A</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground px-1">
        {filteredSongs?.length ?? 0} songs
      </p>
      <div className="grid grid-cols-1 gap-3">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : filteredSongs?.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 flex flex-col items-center gap-2">
            <span className="text-3xl opacity-30">♪</span>
            <p>No songs yet — add one in Song Lab</p>
          </div>
        ) : (
          filteredSongs?.map((song) => (
            <div
              key={song.id}
              className="bg-card rounded-xl overflow-hidden flex items-center p-2 gap-3 border border-card-border hover:border-primary/40 transition-colors group"
            >
              <div
                className="w-[62px] h-[62px] bg-muted rounded-lg overflow-hidden flex-shrink-0 relative"
                style={{ border: `2px solid ${progressColor(song.timesPlayed, song.status)}` }}
              >
                <img
                  src={`https://img.youtube.com/vi/${extractVideoId(song.youtubeUrl)}/default.jpg`}
                  className="w-full h-full object-cover"
                  alt=""
                />
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                <Link href={`/song/${song.id}`} className="block min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{getLanguageFlag(song.language)}</span>
                    <h3
                      className="font-bold truncate group-hover:text-primary transition-colors text-[18px]"
                      data-testid={`text-song-title-${song.id}`}
                    >
                      {song.title}
                    </h3>
                  </div>
                  <p className="truncate mt-0.5 text-[14px] text-[#a39daf]">{song.artist}</p>
                </Link>

                <div className="mt-0.5">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60 hover:text-red-600 transition-colors"
                        data-testid={`btn-delete-${song.id}`}
                      >
                        Delete
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                          <AlertTriangle className="h-8 w-8 text-red-600" strokeWidth={2.5} />
                        </div>
                        <AlertDialogTitle className="text-center">
                          Delete "{song.title}"?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center">
                          This permanently removes the song, its lyrics, and timestamps
                          from your library. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => {
                            deleteSong.mutate(
                              { id: song.id },
                              {
                                onSuccess: () => {
                                  queryClient.invalidateQueries({
                                    queryKey: getListSongsQueryKey(),
                                  });
                                },
                              }
                            );
                          }}
                          data-testid={`btn-delete-confirm-${song.id}`}
                        >
                          Delete song
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="w-5 h-5 rounded-full border-2 border-border shrink-0 transition-transform hover:scale-110 relative"
                    style={{
                      backgroundColor: progressColor(song.timesPlayed, song.status),
                    }}
                    title="Mark as Done"
                    data-testid={`btn-mark-done-${song.id}`}
                  >
                    {song.status === "done" && (
                      <span className="absolute inset-0 flex items-center justify-center text-black text-[8px] font-black">
                        ✓
                      </span>
                    )}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Mark "{song.title}" as Done?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the song as completed. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        updateSong.mutate(
                          { id: song.id, data: { status: "done" } },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({
                                queryKey: getListSongsQueryKey(),
                              });
                            },
                          }
                        );
                      }}
                    >
                      Confirm
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
