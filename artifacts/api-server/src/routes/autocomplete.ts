import { Router, type IRouter } from "express";
import { ilike, asc } from "drizzle-orm";
import { db, songsTable } from "@workspace/db";
import { ListArtistsQueryParams, ListLanguagesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/artists", async (req, res): Promise<void> => {
  const parsed = ListArtistsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q } = parsed.data;

  const rows = await db
    .selectDistinct({ artist: songsTable.artist })
    .from(songsTable)
    .where(q ? ilike(songsTable.artist, `%${q}%`) : undefined)
    .orderBy(asc(songsTable.artist));

  res.json(rows.map((r) => r.artist));
});

router.get("/languages", async (req, res): Promise<void> => {
  const parsed = ListLanguagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q } = parsed.data;

  const rows = await db
    .selectDistinct({ language: songsTable.language })
    .from(songsTable)
    .where(q ? ilike(songsTable.language, `%${q}%`) : undefined)
    .orderBy(asc(songsTable.language));

  res.json(rows.map((r) => r.language));
});

export default router;
