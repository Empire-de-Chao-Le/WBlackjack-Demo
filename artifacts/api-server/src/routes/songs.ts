import { Router, type IRouter } from "express";
import { eq, ilike, or, desc, asc, sql, inArray } from "drizzle-orm";
import { db, songsTable, lyricsTable, timestampsTable, vocabTable } from "@workspace/db";
import {
  ListSongsQueryParams,
  CreateSongBody,
  GetSongParams,
  UpdateSongParams,
  EditSongBody,
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

function deriveThumbnailUrl(youtubeUrl: string): string | null {
  try {
    const u = new URL(youtubeUrl);
    let videoId: string | null = null;
    if (u.hostname.includes("youtu.be")) videoId = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) videoId = u.searchParams.get("v");
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
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
    youtubeThumbnailUrl: song.youtubeThumbnailUrl ?? deriveThumbnailUrl(song.youtubeUrl),
    language: song.language,
    status: song.status,
    timesPlayed: song.timesPlayed,
    dateAdded: song.dateAdded.toISOString(),
    lastPlayed: song.lastPlayed ? song.lastPlayed.toISOString() : null,
    hasLyrics,
    hasTimestamps,
    csvFilename: song.csvFilename ?? null,
    vocabCsvFilename: song.vocabCsvFilename ?? null,
    link: song.link ?? null,
    notes: song.notes ?? null,
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
    const term = `%${search}%`;
    conditions.push(
      or(
        sql`unaccent(lower(${songsTable.title})) LIKE unaccent(lower(${term}))`,
        sql`unaccent(lower(${songsTable.artist})) LIKE unaccent(lower(${term}))`
      )!
    );
  }

  let orderBy;
  switch (sort) {
    case "date_added_asc": orderBy = asc(songsTable.dateAdded); break;
    case "last_played_desc": orderBy = sql`${songsTable.lastPlayed} DESC NULLS LAST`; break;
    case "last_played_asc": orderBy = sql`${songsTable.lastPlayed} ASC NULLS LAST`; break;
    case "title_asc": orderBy = sql`unaccent(lower(${songsTable.title})) ASC`; break;
    case "title_desc": orderBy = sql`unaccent(lower(${songsTable.title})) DESC`; break;
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
    .where(inArray(lyricsTable.songId, songIds))
    .groupBy(lyricsTable.songId);

  const tsCounts = await db
    .select({ songId: timestampsTable.songId, cnt: sql<number>`count(*)::int` })
    .from(timestampsTable)
    .where(inArray(timestampsTable.songId, songIds))
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
      youtubeThumbnailUrl: deriveThumbnailUrl(parsed.data.youtubeUrl),
      language: parsed.data.language,
      status: "new",
      timesPlayed: 0,
      csvFilename: parsed.data.csvFilename ?? null,
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
  const body = EditSongBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.artist !== undefined) updates.artist = body.data.artist;
  if (body.data.title !== undefined) updates.title = body.data.title;
  if (body.data.language !== undefined) updates.language = body.data.language;
  if (body.data.youtubeUrl !== undefined) {
    updates.youtubeUrl = body.data.youtubeUrl;
    updates.youtubeThumbnailUrl = deriveThumbnailUrl(body.data.youtubeUrl);
  }
  if (body.data.status !== undefined) updates.status = body.data.status;
  if (body.data.timesPlayed !== undefined) updates.timesPlayed = body.data.timesPlayed;
  if (body.data.lastPlayed !== undefined)
    updates.lastPlayed = body.data.lastPlayed ? new Date(body.data.lastPlayed) : null;
  if (body.data.csvFilename !== undefined) updates.csvFilename = body.data.csvFilename;
  if (body.data.vocabCsvFilename !== undefined) updates.vocabCsvFilename = body.data.vocabCsvFilename;
  if (body.data.link !== undefined) updates.link = body.data.link;
  if (body.data.notes !== undefined) updates.notes = body.data.notes;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields provided." });
    return;
  }

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

router.put("/songs/:id", async (req, res): Promise<void> => {
  const params = UpdateSongParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = EditSongBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.artist !== undefined) updates.artist = body.data.artist;
  if (body.data.title !== undefined) updates.title = body.data.title;
  if (body.data.language !== undefined) updates.language = body.data.language;
  if (body.data.youtubeUrl !== undefined) {
    updates.youtubeUrl = body.data.youtubeUrl;
    updates.youtubeThumbnailUrl = deriveThumbnailUrl(body.data.youtubeUrl);
  }
  if (body.data.status !== undefined) updates.status = body.data.status;
  if (body.data.timesPlayed !== undefined) updates.timesPlayed = body.data.timesPlayed;
  if (body.data.lastPlayed !== undefined)
    updates.lastPlayed = body.data.lastPlayed ? new Date(body.data.lastPlayed) : null;
  if (body.data.csvFilename !== undefined) updates.csvFilename = body.data.csvFilename;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields provided." });
    return;
  }

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
  await db.delete(vocabTable).where(eq(vocabTable.songId, params.data.id));
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
