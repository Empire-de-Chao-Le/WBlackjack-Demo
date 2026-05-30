import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vocabTable, songsTable } from "@workspace/db";
import { mergeVocabIntoWordPool } from "./word-pool";
import Papa from "papaparse";

const router: IRouter = Router();

function parseSongId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

router.get("/songs/:id/vocab", async (req, res): Promise<void> => {
  const songId = parseSongId(req.params.id);
  if (!songId) {
    res.status(400).json({ error: "Invalid song id" });
    return;
  }

  const [song] = await db
    .select({ id: songsTable.id })
    .from(songsTable)
    .where(eq(songsTable.id, songId));
  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  const vocab = await db
    .select()
    .from(vocabTable)
    .where(eq(vocabTable.songId, songId));

  res.json(
    vocab.map((v) => ({
      id: v.id,
      songId: v.songId,
      phrase: v.phrase,
      translation: v.translation,
    }))
  );
});

router.post("/songs/:id/vocab/csv", async (req, res): Promise<void> => {
  const songId = parseSongId(req.params.id);
  if (!songId) {
    res.status(400).json({ error: "Invalid song id" });
    return;
  }

  const [song] = await db
    .select({ id: songsTable.id, language: songsTable.language })
    .from(songsTable)
    .where(eq(songsTable.id, songId));
  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  const csvText = req.body as string;
  if (typeof csvText !== "string" || !csvText.trim()) {
    res.status(400).json({ error: "Empty CSV body" });
    return;
  }

  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  for (let i = 0; i < parsed.data.length; i++) {
    if (parsed.data[i].length < 2) {
      res.status(400).json({
        error: `Row ${i + 1} has only ${parsed.data[i].length} column(s); expected 2 (phrase, translation).`,
      });
      return;
    }
  }

  const entries = parsed.data.map((row) => ({
    songId,
    phrase: row[0] ?? "",
    translation: row[1] ?? "",
  }));

  await db.delete(vocabTable).where(eq(vocabTable.songId, songId));

  if (entries.length === 0) {
    res.json([]);
    return;
  }

  const inserted = await db.insert(vocabTable).values(entries).returning();

  await mergeVocabIntoWordPool(
    song.language,
    entries.map((e) => ({ phrase: e.phrase, translation: e.translation }))
  );

  res.json(
    inserted.map((v) => ({
      id: v.id,
      songId: v.songId,
      phrase: v.phrase,
      translation: v.translation,
    }))
  );
});

export default router;
