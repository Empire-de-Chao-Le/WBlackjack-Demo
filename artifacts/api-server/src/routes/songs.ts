import { Router, type IRouter } from "express";
import { eq, ilike, or, desc, asc, sql } from "drizzle-orm";
import { db, songsTable, lyricsTable, timestampsTable } from "@workspace/db";
import {
  ListSongsQueryParams,
  CreateSongBody,
  GetSongParams,
  UpdateSongParams,
  UpdateSongBody,
  DeleteSongParams,
  RecordPlayParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    return null;
  } catch {
    return null;
  }
}

function buildSongResponse(
  song: typeof songsTable.$inferSelect,
  hasLyrics: boolean,
  hasTimestamps: boolean
) {
  return {
    id: song.id,
    artist: song.artist,
    title: song.title,
    youtubeUrl: song.youtubeUrl,
    language: song.language,
    status: song.status,
    timesPlayed: song.timesPlayed,
    dateAdded: song.dateAdded.toISOString(),
    lastPlayed: song.lastPlayed ? song.lastPlayed.toISOString() : null,
    hasLyrics,
    hasTimestamps,
  };
}

router.get("/songs", async (req, res): Promise<void> => {
  const parsed = ListSongsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { language, artist, status, sort, search } = parsed.data;

  const conditions = [];
  if (language) conditions.push(eq(songsTable.language, language));
  if (artist) conditions.push(eq(songsTable.artist, artist));
  if (status) conditions.push(eq(songsTable.status, status));
  if (search) {
    conditions.push(
      or(
        ilike(songsTable.title, `%${search}%`),
        ilike(songsTable.artist, `%${search}%`)
      )!
    );
  }

  let orderBy;
  switch (sort) {
    case "date_added_asc": orderBy = asc(songsTable.dateAdded); break;
    case "last_played_desc": orderBy = desc(songsTable.lastPlayed); break;
    case "last_played_asc": orderBy = asc(songsTable.lastPlayed); break;
    case "title_asc": orderBy = asc(songsTable.title); break;
    case "title_desc": orderBy = desc(songsTable.title); break;
    default: orderBy = desc(songsTable.dateAdded); break;
  }

  let query = db.select().from(songsTable).$dynamic();
  if (conditions.length > 0) {
    const [first, ...rest] = conditions;
    let cond = first;
    for (const c of rest) cond = sql`${cond} AND ${c}`;
    query = query.where(cond);
  }
  const songs = await query.orderBy(orderBy);

  const songIds = songs.map((s) => s.id);
  if (songIds.length === 0) {
    res.json([]);
    return;
  }

  const lyricCounts = await db
    .select({ songId: lyricsTable.songId, cnt: sql<number>`count(*)::int` })
    .from(lyricsTable)
    .where(sql`${lyricsTable.songId} = ANY(ARRAY[${sql.join(songIds.map(id => sql`${id}`), sql`, `)}])`)
    .groupBy(lyricsTable.songId);

  const tsCounts = await db
    .select({ songId: timestampsTable.songId, cnt: sql<number>`count(*)::int` })
    .from(timestampsTable)
    .where(sql`${timestampsTable.songId} = ANY(ARRAY[${sql.join(songIds.map(id => sql`${id}`), sql`, `)}])`)
    .groupBy(timestampsTable.songId);

  const lyricMap = new Map(lyricCounts.map((r) => [r.songId, r.cnt]));
  const tsMap = new Map(tsCounts.map((r) => [r.songId, r.cnt]));

  res.json(
    songs.map((s) =>
      buildSongResponse(s, (lyricMap.get(s.id) ?? 0) > 0, (tsMap.get(s.id) ?? 0) > 0)
    )
  );
});

router.get("/songs/stats", async (_req, res): Promise<void> => {
  const all = await db.select({ status: songsTable.status }).from(songsTable);
  const total = all.length;
  const byStatus = { new: 0, active: 0, done: 0 };
  for (const s of all) {
    if (s.status === "new") byStatus.new++;
    else if (s.status === "active") byStatus.active++;
    else if (s.status === "done") byStatus.done++;
  }

  const byLangRows = await db
    .select({
      language: songsTable.language,
      count: sql<number>`count(*)::int`,
    })
    .from(songsTable)
    .groupBy(songsTable.language)
    .orderBy(desc(sql`count(*)`));

  res.json({ total, byStatus, byLanguage: byLangRows });
});

router.post("/songs", async (req, res): Promise<void> => {
  const parsed = CreateSongBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [song] = await db
    .insert(songsTable)
    .values({
      artist: parsed.data.artist,
      title: parsed.data.title,
      youtubeUrl: parsed.data.youtubeUrl,
      language: parsed.data.language,
      status: "new",
      timesPlayed: 0,
    })
    .returning();
  res.status(201).json(buildSongResponse(song, false, false));
});

router.get("/songs/:id", async (req, res): Promise<void> => {
  const params = GetSongParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [song] = await db
    .select()
    .from(songsTable)
    .where(eq(songsTable.id, params.data.id));
  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  const [lyricCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(lyricsTable)
    .where(eq(lyricsTable.songId, song.id));
  const [tsCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(timestampsTable)
    .where(eq(timestampsTable.songId, song.id));

  res.json(
    buildSongResponse(song, (lyricCount?.cnt ?? 0) > 0, (tsCount?.cnt ?? 0) > 0)
  );
});

router.patch("/songs/:id", async (req, res): Promise<void> => {
  const params = UpdateSongParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateSongBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.status !== undefined) updates.status = body.data.status;
  if (body.data.timesPlayed !== undefined) updates.timesPlayed = body.data.timesPlayed;
  if (body.data.lastPlayed !== undefined)
    updates.lastPlayed = body.data.lastPlayed ? new Date(body.data.lastPlayed) : null;

  const [song] = await db
    .update(songsTable)
    .set(updates)
    .where(eq(songsTable.id, params.data.id))
    .returning();
  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  const [lyricCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(lyricsTable)
    .where(eq(lyricsTable.songId, song.id));
  const [tsCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(timestampsTable)
    .where(eq(timestampsTable.songId, song.id));

  res.json(
    buildSongResponse(song, (lyricCount?.cnt ?? 0) > 0, (tsCount?.cnt ?? 0) > 0)
  );
});

router.delete("/songs/:id", async (req, res): Promise<void> => {
  const params = DeleteSongParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(lyricsTable).where(eq(lyricsTable.songId, params.data.id));
  await db.delete(timestampsTable).where(eq(timestampsTable.songId, params.data.id));
  const [song] = await db
    .delete(songsTable)
    .where(eq(songsTable.id, params.data.id))
    .returning();
  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/songs/:id/play", async (req, res): Promise<void> => {
  const params = RecordPlayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(songsTable)
    .where(eq(songsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  const newStatus = existing.status === "new" ? "active" : existing.status;
  const [song] = await db
    .update(songsTable)
    .set({
      timesPlayed: existing.timesPlayed + 1,
      lastPlayed: new Date(),
      status: newStatus,
    })
    .where(eq(songsTable.id, params.data.id))
    .returning();

  const [lyricCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(lyricsTable)
    .where(eq(lyricsTable.songId, song.id));
  const [tsCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(timestampsTable)
    .where(eq(timestampsTable.songId, song.id));

  res.json(
    buildSongResponse(song, (lyricCount?.cnt ?? 0) > 0, (tsCount?.cnt ?? 0) > 0)
  );
});

export default router;
