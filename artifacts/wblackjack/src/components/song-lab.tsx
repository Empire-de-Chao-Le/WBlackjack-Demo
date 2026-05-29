import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Papa from "papaparse";
import { SyncTool } from "./sync-tool";

export function SongLab() {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results: Papa.ParseResult<string[]>) => {
          setCsvData(results.data);
        }
      });
    }
  };

  const isValid = artist && title && youtubeUrl && language && csvData.length > 0;

  if (isSyncing) {
    return <SyncTool 
      artist={artist} 
      title={title} 
      youtubeUrl={youtubeUrl} 
      language={language} 
      lines={csvData.map((row: any, idx) => ({
        lineIndex: idx,
        original: row[0] || "",
        translation: row[1] || "",
        distractor1: row[2] || "",
        distractor2: row[3] || "",
        distractor3: row[4] || "",
        distractor4: row[5] || ""
      }))} 
    />;
  }

  return (
    <div className="flex flex-col gap-6 max-w-md mx-auto w-full p-4 bg-card border border-border rounded-xl shadow-sm mt-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Artist</Label>
          <Input value={artist} onChange={e => setArtist(e.target.value)} placeholder="e.g. Stromae" data-testid="input-artist" />
        </div>
        <div className="space-y-2">
          <Label>Song Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Papaoutai" data-testid="input-title" />
        </div>
        <div className="space-y-2">
          <Label>YouTube URL</Label>
          <Input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/..." data-testid="input-youtube" />
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="e.g. French" data-testid="input-language" />
        </div>
        <div className="space-y-2">
          <Label>Lyrics CSV (6 cols: orig, trans, d1, d2, d3, d4)</Label>
          <Input type="file" accept=".csv" onChange={handleFileUpload} className="cursor-pointer file:text-primary-foreground file:bg-primary file:border-none file:rounded-md file:px-3 file:py-1 file:mr-4 file:cursor-pointer" data-testid="input-csv" />
          {csvData.length > 0 && <p className="text-sm text-green-500 mt-1">{csvData.length} lines loaded.</p>}
        </div>
      </div>
      
      <Button 
        onClick={() => setIsSyncing(true)} 
        disabled={!isValid} 
        size="lg" 
        className="w-full mt-4 font-bold"
        data-testid="btn-start-sync"
      >
        Start Sync
      </Button>
    </div>
  );
}
