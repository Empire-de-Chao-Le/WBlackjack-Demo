import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import {
  useGetSong,
  useGetSongLyrics,
  useUploadLyricsCsv,
  getGetSongQueryKey,
  getListSongsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, Pencil, RefreshCw, Save, AlertTriangle } from "lucide-react";
import { SyncTool } from "@/components/sync-tool";
import Papa from "papaparse";

type LyricLineInput = {
  lineIndex: number;
  original: string;
  translation: string;
  distractor1: string;
  distractor2: string;
  distractor3: string;
  distractor4: string;
};

export default function SongEdit() {
  const [, params] = useRoute("/song/:id/edit");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  useAndroidBack(() => setLocation(`/song/${id}`));
  const queryClient = useQueryClient();

  const { data: song, isLoading: songLoading } = useGetSong(id, {
    query: { enabled: !!id, queryKey: getGetSongQueryKey(id) },
  });
  const { data: lyrics, isLoading: lyricsLoading } = useGetSongLyrics(id, {
    query: { enabled: !!id },
  });

  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("");
  const [initialized, setInitialized] = useState(false);

  const [newLyricsCsvText, setNewLyricsCsvText] = useState<string | null>(null);
  const [newLyricsFileName, setNewLyricsFileName] = useState<string | null>(null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [lyricsInputKey, setLyricsInputKey] = useState(0);

  // Mismatch dialog state
  const [pendingNewRows, setPendingNewRows] = useState<string[][] | null>(null);
  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [pendingNewCount, setPendingNewCount] = useState(0);

  // Re-sync with new CSV lines (overrides existing syncLines)
  const [resyncLines, setResyncLines] = useState<LyricLineInput[] | null>(null);

  const [newVocabCsvText, setNewVocabCsvText] = useState<string | null>(null);
  const [newVocabFileName, setNewVocabFileName] = useState<string | null>(null);
  const [vocabError, setVocabError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const uploadLyricsCsv = useUploadLyricsCsv();

  useEffect(() => {
    if (song && !initialized) {
      setArtist(song.artist);
      setTitle(song.title);
      setLanguage(song.language);
      setInitialized(true);
    }
  }, [song, initialized]);

  const handleLyricsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLyricsError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
      const badRow = parsed.data.findIndex((row) => row.length < 6);
      if (badRow !== -1) {
        setLyricsError(
          `Row ${badRow + 1} has only ${parsed.data[badRow].length} column(s) — need 6 (orig, trans, d1, d2, d3, d4).`
        );
        setNewLyricsCsvText(null);
        setNewLyricsFileName(null);
        return;
      }

      const newCount = parsed.data.length;
      const oldCount = lyrics?.length ?? 0;

      if (oldCount > 0 && newCount !== oldCount) {
        // Line count mismatch — show warning dialog
        setPendingNewRows(parsed.data);
        setPendingNewCount(newCount);
        setShowMismatchDialog(true);
        // Don't accept the file yet
        setNewLyricsCsvText(null);
        setNewLyricsFileName(null);
      } else {
        // Counts match (or no existing lyrics) — accept immediately
        setNewLyricsCsvText(text);
        setNewLyricsFileName(file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleMismatchGoBack = () => {
    setPendingNewRows(null);
    setShowMismatchDialog(false);
    setLyricsInputKey((k) => k + 1); // Reset file input
  };

  const handleMismatchResync = () => {
    if (!pendingNewRows) return;
    const lines: LyricLineInput[] = pendingNewRows.map((row, idx) => ({
      lineIndex: idx,
      original: row[0] ?? "",
      translation: row[1] ?? "",
      distractor1: row[2] ?? "",
      distractor2: row[3] ?? "",
      distractor3: row[4] ?? "",
      distractor4: row[5] ?? "",
    }));
    setResyncLines(lines);
    setPendingNewRows(null);
    setShowMismatchDialog(false);
    setIsSyncing(true);
  };

  const handleVocabFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVocabError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
      const badRow = parsed.data.findIndex((row) => row.length < 2);
      if (badRow !== -1) {
        setVocabError(
          `Row ${badRow + 1} has only ${parsed.data[badRow].length} column(s) — need 2 (phrase, translation).`
        );
        setNewVocabCsvText(null);
        setNewVocabFileName(null);
        return;
      }
      setNewVocabCsvText(text);
      setNewVocabFileName(file.name);
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!song) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const patchData: Record<string, string> = {};
      if (artist.trim() && artist !== song.artist) patchData.artist = artist.trim();
      if (title.trim() && title !== song.title) patchData.title = title.trim();
      if (language.trim() && language !== song.language) patchData.language = language.trim();

      if (Object.keys(patchData).length > 0) {
        const res = await fetch(`/api/songs/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patchData),
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error("Failed to update song metadata.");
      }

      if (newLyricsCsvText) {
        await uploadLyricsCsv.mutateAsync({ id, data: newLyricsCsvText });
      }

      if (newVocabCsvText) {
        const res = await fetch(`/api/songs/${id}/vocab/csv`, {
          method: "POST",
          body: newVocabCsvText,
          headers: { "Content-Type": "text/csv" },
        });
        if (!res.ok) throw new Error("Failed to upload vocab CSV.");
      }

      queryClient.invalidateQueries({ queryKey: getGetSongQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
      setLocation(`/song/${id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "An error occurred.");
      setIsSaving(false);
    }
  };

  // Lines used for the SyncTool: new CSV lines (re-sync) or existing lyrics
  const syncLines: LyricLineInput[] = (lyrics ?? []).map((l) => ({
    lineIndex: l.lineIndex,
    original: l.original,
    translation: l.translation,
    distractor1: l.distractor1 ?? "",
    distractor2: l.distractor2 ?? "",
    distractor3: l.distractor3 ?? "",
    distractor4: l.distractor4 ?? "",
  }));

  const effectiveSyncLines = resyncLines ?? syncLines;

  if (isSyncing && song && effectiveSyncLines.length > 0) {
    return (
      <SyncTool
        artist={song.artist}
        title={song.title}
        youtubeUrl={song.youtubeUrl}
        language={song.language}
        existingSongId={song.id}
        lines={effectiveSyncLines}
        onExit={() => { setIsSyncing(false); setResyncLines(null); }}
        onSaved={() => { setIsSyncing(false); setResyncLines(null); setLocation(`/song/${id}`); }}
      />
    );
  }

  if (songLoading) return <div className="p-8 text-center">Loading…</div>;
  if (!song) return <div className="p-8 text-center text-destructive">Song not found.</div>;

  const hasChanges =
    artist.trim() !== song.artist ||
    title.trim() !== song.title ||
    language.trim() !== song.language ||
    !!newLyricsCsvText ||
    !!newVocabCsvText;

  const oldCount = lyrics?.length ?? 0;

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 max-w-lg mx-auto w-full gap-6">
      {/* Line-count mismatch dialog */}
      <AlertDialog open={showMismatchDialog} onOpenChange={(open) => { if (!open) handleMismatchGoBack(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-950">
              <AlertTriangle className="h-8 w-8 text-yellow-600" strokeWidth={2.5} />
            </div>
            <AlertDialogTitle className="text-center">Line count mismatch</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              The new CSV has <strong>{pendingNewCount}</strong> line{pendingNewCount !== 1 ? "s" : ""}, but the existing lyrics have <strong>{oldCount}</strong>.
              <br /><br />
              The existing timestamps cannot be applied to a different number of lines. You can go back and use the correct CSV, or start a full Re-Sync to record new timestamps for the new lyrics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={handleMismatchGoBack} className="flex-1">
              Go Back
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleMismatchResync} className="flex-1">
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-Sync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setLocation(`/song/${id}`)}
          className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-7 h-7" />
        </button>
        <div className="flex items-center gap-2">
          <Pencil className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold">Edit Song</h1>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Metadata</h2>

        <div className="space-y-2">
          <Label htmlFor="edit-artist">Artist</Label>
          <Input
            id="edit-artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist name"
            data-testid="edit-artist"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-title">Song Title</Label>
          <Input
            id="edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song title"
            data-testid="edit-title"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-language">Language</Label>
          <Input
            id="edit-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="e.g. French"
            data-testid="edit-language"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Re-upload Files</h2>

        <div className="space-y-2">
          <Label>
            Lyrics CSV{" "}
            <span className="text-muted-foreground font-normal">(6 cols: orig, trans, d1–d4)</span>
            {oldCount > 0 && (
              <span className="text-muted-foreground font-normal"> — current: {oldCount} lines</span>
            )}
          </Label>
          <Input
            key={lyricsInputKey}
            type="file"
            accept=".csv"
            onChange={handleLyricsFile}
            className="cursor-pointer file:text-primary-foreground file:bg-primary file:border-none file:rounded-md file:px-3 file:py-1 file:mr-4 file:cursor-pointer"
            data-testid="edit-lyrics-csv"
          />
          {lyricsError && <p className="text-sm text-destructive">{lyricsError}</p>}
          {!lyricsError && newLyricsFileName && (
            <p className="text-sm text-green-500">{newLyricsFileName} ready to upload.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Vocab CSV <span className="text-muted-foreground font-normal">(2 cols: phrase, translation) — optional</span></Label>
          <Input
            type="file"
            accept=".csv"
            onChange={handleVocabFile}
            className="cursor-pointer file:text-primary-foreground file:bg-primary file:border-none file:rounded-md file:px-3 file:py-1 file:mr-4 file:cursor-pointer"
            data-testid="edit-vocab-csv"
          />
          {vocabError && <p className="text-sm text-destructive">{vocabError}</p>}
          {!vocabError && newVocabFileName && (
            <p className="text-sm text-green-500">{newVocabFileName} ready to upload.</p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Re-sync Timestamps</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Re-open the Sync Tool with the current lyrics to record new timestamps.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsSyncing(true)}
          disabled={lyricsLoading || syncLines.length === 0}
          data-testid="btn-resync"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {lyricsLoading ? "Loading lyrics…" : syncLines.length === 0 ? "No lyrics to sync" : "Open Sync Tool"}
        </Button>
      </div>

      {saveError && (
        <p className="text-sm text-destructive text-center">{saveError}</p>
      )}

      <div className="flex gap-3 pb-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setLocation(`/song/${id}`)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={isSaving || !hasChanges || !!lyricsError || !!vocabError}
          data-testid="btn-save-edit"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
