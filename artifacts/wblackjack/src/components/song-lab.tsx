import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Papa from "papaparse";
import { SyncTool } from "./sync-tool";
import { getLanguageFlag } from "@/lib/helpers";
import {
  useListArtists,
  useListLanguages,
  useListSongs,
  useCreateSong,
  useUpsertLyrics,
  getListSongsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  const [csvFilename, setCsvFilename] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [vocabCsvText, setVocabCsvText] = useState<string | null>(null);
  const [vocabCsvFilename, setVocabCsvFilename] = useState<string | null>(null);
  const [vocabCsvError, setVocabCsvError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingForLater, setIsSavingForLater] = useState(false);
  const [dupMessage, setDupMessage] = useState<string | null>(null);
  const pendingActionRef = useRef<"sync" | "save">("sync");

  const { data: artists } = useListArtists();
  const { data: languages } = useListLanguages();
  const { data: songs, isLoading: songsLoading } = useListSongs({});
  const createSong = useCreateSong();
  const upsertLyrics = useUpsertLyrics();
  const queryClient = useQueryClient();

  const artistSuggestions = (artists ?? []) as string[];
  const languageSuggestions = (languages ?? []) as string[];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    setCsvFilename(file.name);
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
          setCsvFilename(null);
          return;
        }
        setCsvData(rows);
      },
    });
  };

  const handleVocabUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setVocabCsvText(null); setVocabCsvFilename(null); return; }
    setVocabCsvError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
      const badRow = parsed.data.findIndex((row) => row.length < 2);
      if (badRow !== -1) {
        setVocabCsvError(
          `Row ${badRow + 1} has only ${parsed.data[badRow].length} column(s) — need 2 (phrase, translation).`
        );
        setVocabCsvText(null);
        setVocabCsvFilename(null);
        return;
      }
      setVocabCsvText(text);
      setVocabCsvFilename(file.name);
    };
    reader.readAsText(file);
  };

  const isValid =
    artist.trim() &&
    title.trim() &&
    youtubeUrl.trim() &&
    language.trim() &&
    csvData.length > 0 &&
    !csvError &&
    !songsLoading;

  const runWithDupCheck = (action: "sync" | "save") => {
    pendingActionRef.current = action;
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
      if (songMatch) parts.push(`the song "${artist.trim()} - ${title.trim()}"`);
      if (videoMatch) parts.push(`the video ${youtubeUrl.trim()}`);
      setDupMessage(
        `${parts.join(" / ")} ${parts.length > 1 ? "are" : "is"} already in your library! Add another version?`
      );
      return;
    }
    proceedWithAction(action);
  };

  const proceedWithAction = (action: "sync" | "save") => {
    if (action === "sync") {
      setIsSyncing(true);
    } else {
      doSaveForLater();
    }
  };

  const doSaveForLater = async () => {
    setIsSavingForLater(true);
    try {
      const song = await createSong.mutateAsync({
        data: { artist, title, youtubeUrl, language, csvFilename: csvFilename ?? undefined },
      });
      const songId = song.id;
      await upsertLyrics.mutateAsync({
        id: songId,
        data: {
          lines: csvData.map((row, idx) => ({
            lineIndex: idx,
            original: row[0] ?? "",
            translation: row[1] ?? "",
            distractor1: row[2] ?? "",
            distractor2: row[3] ?? "",
            distractor3: row[4] ?? "",
            distractor4: row[5] ?? "",
          })),
        },
      });
      if (vocabCsvText) {
        await fetch(`/api/songs/${songId}/vocab/csv`, {
          method: "POST",
          body: vocabCsvText,
          headers: { "Content-Type": "text/csv" },
        });
        if (vocabCsvFilename) {
          await fetch(`/api/songs/${songId}`, {
            method: "PATCH",
            body: JSON.stringify({ vocabCsvFilename }),
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
      onSongAdded?.();
    } catch (e) {
      console.error(e);
      setIsSavingForLater(false);
    }
  };

  if (isSyncing) {
    return (
      <SyncTool
        artist={artist}
        title={title}
        youtubeUrl={youtubeUrl}
        language={language}
        csvFilename={csvFilename ?? undefined}
        onExit={() => setIsSyncing(false)}
        onSaved={() => {
          setIsSyncing(false);
          onSongAdded?.();
        }}
        vocabCsv={vocabCsvText ?? undefined}
        vocabCsvFilename={vocabCsvFilename ?? undefined}
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
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <AutocompleteInput
                value={language}
                onChange={setLanguage}
                suggestions={languageSuggestions}
                placeholder="e.g. French"
                testId="input-language"
              />
            </div>
            <div className="shrink-0 w-10 h-10 rounded-lg border border-border bg-muted flex items-center justify-center text-2xl leading-none select-none">
              {language.trim() ? getLanguageFlag(language.trim()) : ""}
            </div>
          </div>
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
        <div className="space-y-2">
          <Label>Vocab CSV <span className="font-normal text-muted-foreground">(2 cols: phrase, translation) — optional</span></Label>
          <Input
            type="file"
            accept=".csv"
            onChange={handleVocabUpload}
            className="cursor-pointer file:text-primary-foreground file:bg-primary file:border-none file:rounded-md file:px-3 file:py-1 file:mr-4 file:cursor-pointer"
            data-testid="input-vocab-csv"
          />
          {vocabCsvError && (
            <p className="text-sm text-destructive mt-1">{vocabCsvError}</p>
          )}
          {!vocabCsvError && vocabCsvText && (
            <p className="text-sm text-green-500 mt-1">Vocab loaded.</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <Button
          onClick={() => runWithDupCheck("save")}
          disabled={!isValid || isSavingForLater}
          size="lg"
          variant="outline"
          className="flex-1 font-bold border-2"
          data-testid="btn-save-for-later"
        >
          {isSavingForLater ? "Saving…" : "Save for later"}
        </Button>
        <Button
          onClick={() => runWithDupCheck("sync")}
          disabled={!isValid || isSavingForLater}
          size="lg"
          className="flex-1 font-bold"
          data-testid="btn-start-sync"
        >
          Sync now
        </Button>
      </div>

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
                proceedWithAction(pendingActionRef.current);
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
