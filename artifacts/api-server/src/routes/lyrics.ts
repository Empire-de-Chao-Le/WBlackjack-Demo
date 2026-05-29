import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, lyricsTable, timestampsTable, songsTable } from "@workspace/db";
import {
  UpsertLyricsParams,
  UpsertLyricsBody,
  SaveTimestampsParams,
  SaveTimestampsBody,
  GetSongLyricsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/songs/:id/lyrics", async (req, res): Promise<void> => {
  const params = GetSongLyricsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [song] = await db
    .select({ id: songsTable.id })
    .from(songsTable)
    .where(eq(songsTable.id, params.data.id));
  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  const lyrics = await db
    .select()
    .from(lyricsTable)
    .where(eq(lyricsTable.songId, params.data.id))
    .orderBy(asc(lyricsTable.lineIndex));

  const timestamps = await db
    .select()
    .from(timestampsTable)
    .where(eq(timestampsTable.songId, params.data.id));

  const tsMap = new Map(timestamps.map((t) => [t.lineIndex, t.timestampMs]));

  const result = lyrics.map((l) => ({
    id: l.id,
    songId: l.songId,
    lineIndex: l.lineIndex,
    original: l.original,
    translation: l.translation,
    distractor1: l.distractor1 ?? null,
    distractor2: l.distractor2 ?? null,
    distractor3: l.distractor3 ?? null,
    distractor4: l.distractor4 ?? null,
    timestampMs: tsMap.get(l.lineIndex) ?? null,
  }));

  res.json(result);
});

router.post("/songs/:id/lyrics", async (req, res): Promise<void> => {
  const params = UpsertLyricsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpsertLyricsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [song] = await db
    .select({ id: songsTable.id })
    .from(songsTable)
    .where(eq(songsTable.id, params.data.id));
  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  await db.delete(lyricsTable).where(eq(lyricsTable.songId, params.data.id));

  const rows = body.data.lines.map((l) => ({
    songId: params.data.id,
    lineIndex: l.lineIndex,
    original: l.original,
    translation: l.translation,
    distractor1: l.distractor1 ?? null,
    distractor2: l.distractor2 ?? null,
    distractor3: l.distractor3 ?? null,
    distractor4: l.distractor4 ?? null,
  }));

  const inserted = await db.insert(lyricsTable).values(rows).returning();

  const timestamps = await db
    .select()
    .from(timestampsTable)
    .where(eq(timestampsTable.songId, params.data.id));
  const tsMap = new Map(timestamps.map((t) => [t.lineIndex, t.timestampMs]));

  res.json(
    inserted
      .sort((a, b) => a.lineIndex - b.lineIndex)
      .map((l) => ({
        id: l.id,
        songId: l.songId,
        lineIndex: l.lineIndex,
        original: l.original,
        translation: l.translation,
        distractor1: l.distractor1 ?? null,
        distractor2: l.distractor2 ?? null,
        distractor3: l.distractor3 ?? null,
        distractor4: l.distractor4 ?? null,
        timestampMs: tsMap.get(l.lineIndex) ?? null,
      }))
  );
});

router.post("/songs/:id/timestamps", async (req, res): Promise<void> => {
  const params = SaveTimestampsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SaveTimestampsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [song] = await db
    .select({ id: songsTable.id })
    .from(songsTable)
    .where(eq(songsTable.id, params.data.id));
  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  await db.delete(timestampsTable).where(eq(timestampsTable.songId, params.data.id));

  if (body.data.timestamps.length === 0) {
    res.json([]);
    return;
  }

  const rows = body.data.timestamps.map((t) => ({
    songId: params.data.id,
    lineIndex: t.lineIndex,
    timestampMs: t.timestampMs,
  }));

  const inserted = await db.insert(timestampsTable).values(rows).returning();

  res.json(
    inserted
      .sort((a, b) => a.lineIndex - b.lineIndex)
      .map((t) => ({ lineIndex: t.lineIndex, timestampMs: t.timestampMs }))
  );
});

export default router;
