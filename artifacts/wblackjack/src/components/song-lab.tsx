import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Papa from "papaparse";
import { SyncTool } from "./sync-tool";
import {
  useListArtists,
  useListLanguages,
  useListSongs,
} from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
  return match ? match[1] : url.trim();
}

function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? suggestions.filter(
        (s) =>
          s.toLowerCase().includes(value.toLowerCase()) &&
          s.toLowerCase() !== value.toLowerCase()
      )
    : suggestions;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        data-testid={testId}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-48 overflow-auto">
          {filtered.map((s) => (
            <li
              key={s}
              className="px-3 py-2 cursor-pointer hover:bg-muted text-sm text-foreground"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MIN_COLS = 6;

export function SongLab({ onSongAdded }: { onSongAdded?: () => void } = {}) {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dupMessage, setDupMessage] = useState<string | null>(null);

  const { data: artists } = useListArtists();
  const { data: languages } = useListLanguages();
  const { data: songs, isLoading: songsLoading } = useListSongs({});

  const artistSuggestions = (artists ?? []) as string[];
  const languageSuggestions = (languages ?? []) as string[];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        const badRows = rows
          .map((row, i) => ({ row, i }))
          .filter(({ row }) => row.length < MIN_COLS);
        if (badRows.length > 0) {
          setCsvError(
            `Row ${badRows[0].i + 1} has only ${badRows[0].row.length} column(s) — ` +
            `each row must have exactly 6 columns: original, translation, d1, d2, d3, d4.`
          );
          setCsvData([]);
          return;
        }
        setCsvData(rows);
      },
    });
  };

  const isValid =
    artist.trim() &&
    title.trim() &&
    youtubeUrl.trim() &&
    language.trim() &&
    csvData.length > 0 &&
    !csvError &&
    !songsLoading;

  const handleStartSync = () => {
    const existing = (songs ?? []) as {
      artist: string;
      title: string;
      youtubeUrl: string;
    }[];
    const newVideoId = extractVideoId(youtubeUrl);
    const songMatch = existing.find(
      (s) =>
        s.artist.trim().toLowerCase() === artist.trim().toLowerCase() &&
        s.title.trim().toLowerCase() === title.trim().toLowerCase()
    );
    const videoMatch = existing.find(
      (s) => extractVideoId(s.youtubeUrl) === newVideoId
    );

    if (songMatch || videoMatch) {
      const parts: string[] = [];
      if (songMatch) {
        parts.push(`the song "${artist.trim()} - ${title.trim()}"`);
      }
      if (videoMatch) {
        parts.push(`the video ${youtubeUrl.trim()}`);
      }
      setDupMessage(
        `${parts.join(" / ")} ${parts.length > 1 ? "are" : "is"} already in your library! Add another version?`
      );
      return;
    }

    setIsSyncing(true);
  };

  if (isSyncing) {
    return (
      <SyncTool
        artist={artist}
        title={title}
        youtubeUrl={youtubeUrl}
        language={language}
        onExit={() => setIsSyncing(false)}
        onSaved={() => {
          setIsSyncing(false);
          onSongAdded?.();
        }}
        lines={csvData.map((row, idx) => ({
          lineIndex: idx,
          original: row[0] ?? "",
          translation: row[1] ?? "",
          distractor1: row[2] ?? "",
          distractor2: row[3] ?? "",
          distractor3: row[4] ?? "",
          distractor4: row[5] ?? "",
        }))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-md mx-auto w-full p-4 bg-card border border-border rounded-xl shadow-sm mt-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Artist</Label>
          <AutocompleteInput
            value={artist}
            onChange={setArtist}
            suggestions={artistSuggestions}
            placeholder="e.g. Stromae"
            testId="input-artist"
          />
        </div>
        <div className="space-y-2">
          <Label>Song Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Papaoutai"
            data-testid="input-title"
          />
        </div>
        <div className="space-y-2">
          <Label>YouTube URL</Label>
          <Input
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://youtube.com/..."
            data-testid="input-youtube"
          />
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <AutocompleteInput
            value={language}
            onChange={setLanguage}
            suggestions={languageSuggestions}
            placeholder="e.g. French"
            testId="input-language"
          />
        </div>
        <div className="space-y-2">
          <Label>Lyrics CSV (6 cols: orig, trans, d1, d2, d3, d4)</Label>
          <Input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="cursor-pointer file:text-primary-foreground file:bg-primary file:border-none file:rounded-md file:px-3 file:py-1 file:mr-4 file:cursor-pointer"
            data-testid="input-csv"
          />
          {csvError && (
            <p className="text-sm text-destructive mt-1">{csvError}</p>
          )}
          {!csvError && csvData.length > 0 && (
            <p className="text-sm text-green-500 mt-1">
              {csvData.length} lines loaded.
            </p>
          )}
        </div>
      </div>

      <Button
        onClick={handleStartSync}
        disabled={!isValid}
        size="lg"
        className="w-full mt-4 font-bold"
        data-testid="btn-start-sync"
      >
        Start Sync
      </Button>

      <AlertDialog
        open={dupMessage !== null}
        onOpenChange={(open) => {
          if (!open) setDupMessage(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Already in your library</AlertDialogTitle>
            <AlertDialogDescription>{dupMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-dup-no">No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDupMessage(null);
                setIsSyncing(true);
              }}
              data-testid="btn-dup-yes"
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
