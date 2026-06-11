import { useState, useEffect } from "react";
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
import {
  ArrowLeft, Mic, Brain, Pencil, BookOpen, Languages, ScrollText,
  Link2, FileText, ExternalLink, Check, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { getLanguageFlag } from "@/lib/helpers";
import { SyncTool } from "@/components/sync-tool";
import ReactMarkdown from "react-markdown";

type Panel = null | "link-edit" | "notes-view" | "notes-edit";

export default function SongPage() {
  const [, params] = useRoute("/song/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const { data: song, isLoading } = useGetSong(id, { query: { enabled: !!id, queryKey: getGetSongQueryKey(id) } });

  const needsSync = song?.hasTimestamps === false;

  const { data: lyrics } = useGetSongLyrics(id, {
    query: { enabled: !!id && needsSync, queryKey: getGetSongLyricsQueryKey(id) },
  });

  const [panel, setPanel] = useState<Panel>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [saving, setSaving] = useState<"link" | "notes" | null>(null);

  useEffect(() => {
    if (song) {
      setLinkDraft(song.link ?? "");
      setNotesDraft(song.notes ?? "");
    }
  }, [song?.id]);

  useAndroidBack(() => {
    if (isSyncing) setIsSyncing(false);
    else if (panel) setPanel(null);
    else setLocation("/");
  });

  const saveLink = async () => {
    setSaving("link");
    try {
      await fetch(`/api/songs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: linkDraft.trim() || null }),
      });
      await queryClient.invalidateQueries({ queryKey: getGetSongQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
    } finally {
      setSaving(null);
      setPanel(null);
    }
  };

  const saveNotes = async () => {
    setSaving("notes");
    try {
      await fetch(`/api/songs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft.trim() || null }),
      });
      await queryClient.invalidateQueries({ queryKey: getGetSongQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListSongsQueryKey() });
    } finally {
      setSaving(null);
      setPanel(notesDraft.trim() ? "notes-view" : null);
    }
  };

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!song) return <div className="p-8 text-center text-destructive">Song not found.</div>;

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

  const hasLink = !!song.link;
  const hasNotes = !!song.notes;

  const handleLinkClick = () => {
    if (hasLink) {
      let url = song.link!;
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setLinkDraft("");
      setPanel("link-edit");
    }
  };

  const handleNotesClick = () => {
    if (panel === "notes-view" || panel === "notes-edit") {
      setPanel(null);
    } else if (hasNotes) {
      setPanel("notes-view");
    } else {
      setNotesDraft("");
      setPanel("notes-edit");
    }
  };

  const cancelLink = () => {
    setLinkDraft(song.link ?? "");
    setPanel(null);
  };

  const cancelNotes = () => {
    setNotesDraft(song.notes ?? "");
    setPanel(hasNotes ? "notes-view" : null);
  };

  const notesOpen = panel === "notes-view" || panel === "notes-edit";

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
            className="w-full h-24 text-[22px] bg-primary hover:bg-muted text-primary-foreground font-bold shadow-lg rounded-lg flex items-center justify-center gap-3 relative"
            data-testid="btn-karaoke"
          >
            <Mic className="w-[28px] h-[28px]" />
            Karaoke
            <span className="absolute top-2 right-3 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full leading-5">
              Not synced — tap to sync
            </span>
          </button>
        ) : (
          <Link href={`/song/${song.id}/karaoke`} className="block">
            <Button size="lg" className="w-full h-24 text-[22px] bg-primary hover:bg-muted text-primary-foreground font-bold shadow-lg flex items-center justify-center gap-3" data-testid="btn-karaoke">
              <Mic className="w-[28px] h-[28px]" />
              Karaoke
            </Button>
          </Link>
        )}

        <Link href={`/song/${song.id}/exercises`} className="block">
          <Button size="lg" className="w-full h-24 text-[22px] bg-primary hover:bg-muted text-primary-foreground font-bold shadow-lg flex items-center justify-center gap-3" data-testid="btn-exercises">
            <Brain className="w-[28px] h-[28px]" />
            Exercises
          </Button>
        </Link>

        <div className="grid grid-cols-3 gap-3">
          <Link href={`/song/${song.id}/lyrics`} className="block">
            <button className="w-full h-14 rounded-lg border border-border font-medium flex items-center justify-center gap-2 text-sm text-foreground hover:bg-[#8c3cdd]/10 hover:text-[#8c3cdd] hover:border-[#8c3cdd]/40 transition-colors" data-testid="btn-lyrics">
              <ScrollText className="w-5 h-5" />
              Lyrics
            </button>
          </Link>
          <Link href={`/song/${song.id}/vocab`} className="block">
            <button className="w-full h-14 rounded-lg border border-border font-medium flex items-center justify-center gap-2 text-sm text-foreground hover:bg-[#8c3cdd]/10 hover:text-[#8c3cdd] hover:border-[#8c3cdd]/40 transition-colors" data-testid="btn-vocab">
              <BookOpen className="w-5 h-5" />
              Vocab
            </button>
          </Link>
          <Link href={`/song/${song.id}/translation`} className="block">
            <button className="w-full h-14 rounded-lg border border-border font-medium flex items-center justify-center gap-2 text-sm text-foreground hover:bg-[#8c3cdd]/10 hover:text-[#8c3cdd] hover:border-[#8c3cdd]/40 transition-colors" data-testid="btn-translation">
              <Languages className="w-5 h-5" />
              Translation
            </button>
          </Link>
        </div>

        {/* ── Link & Notes strip ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Link button */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <button
                onClick={handleLinkClick}
                className={`flex-1 h-14 rounded-lg border font-medium flex items-center justify-center gap-2 transition-colors text-sm
                  ${hasLink
                    ? "border-[#8c3cdd] text-[#8c3cdd] hover:bg-[#8c3cdd]/10"
                    : "border-border text-muted-foreground hover:bg-[#8c3cdd]/8 hover:border-[#8c3cdd]/30"
                  }`}
                data-testid="btn-link"
              >
                {hasLink ? <ExternalLink className="w-4 h-4 shrink-0" /> : <Link2 className="w-4 h-4 shrink-0" />}
                <span className="truncate max-w-[80px]">
                  {hasLink ? "Open link" : "Add link"}
                </span>
              </button>
              {hasLink && (
                <button
                  onClick={() => { setLinkDraft(song.link ?? ""); setPanel("link-edit"); }}
                  className="h-14 w-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-[#8c3cdd]/8 hover:border-[#8c3cdd]/30 transition-colors shrink-0"
                  aria-label="Edit link"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Notes button */}
          <button
            onClick={handleNotesClick}
            className={`h-14 rounded-lg border font-medium flex items-center justify-center gap-2 transition-colors text-sm
              ${hasNotes
                ? "border-[#8c3cdd] text-[#8c3cdd] hover:bg-[#8c3cdd]/10"
                : "border-border text-muted-foreground hover:bg-[#8c3cdd]/8 hover:border-[#8c3cdd]/30"
              }`}
            data-testid="btn-notes"
          >
            <FileText className="w-4 h-4 shrink-0" />
            {hasNotes ? "Notes" : "Add notes"}
            {hasNotes && (notesOpen
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* ── Link edit panel ───────────────────────────────────────── */}
        {panel === "link-edit" && (
          <div className="rounded-xl border border-border p-4 flex flex-col gap-3 bg-card">
            <p className="text-sm font-medium text-foreground">Song link</p>
            <input
              type="url"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="https://…"
              autoFocus
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => { if (e.key === "Enter") saveLink(); if (e.key === "Escape") cancelLink(); }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelLink}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={saveLink}
                disabled={saving === "link"}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#8c3cdd] text-white text-sm font-medium hover:bg-[#7b2fcc] disabled:opacity-60 transition-colors"
              >
                <Check className="w-4 h-4" /> {saving === "link" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* ── Notes panel ──────────────────────────────────────────── */}
        {notesOpen && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {panel === "notes-view" ? (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Notes</p>
                  <button
                    onClick={() => { setNotesDraft(song.notes ?? ""); setPanel("notes-edit"); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none text-foreground text-[16px]">
                  <ReactMarkdown>{song.notes ?? ""}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-3">
                <p className="text-sm font-medium text-foreground">Notes</p>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder={"Add notes… (supports **bold**, *italics*, - bullet lists)"}
                  autoFocus
                  rows={6}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={cancelNotes}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                  <button
                    onClick={saveNotes}
                    disabled={saving === "notes"}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#8c3cdd] text-white text-sm font-medium hover:bg-[#7b2fcc] disabled:opacity-60 transition-colors"
                  >
                    <Check className="w-4 h-4" /> {saving === "notes" ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
