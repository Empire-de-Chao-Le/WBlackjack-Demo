import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, wordPoolTable, vocabTable, songsTable, flashcardProgressTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * Merge vocab entries into the word pool for a given language.
 * Deduplicates by exact TL phrase — if a phrase already exists in the pool
 * (for that language), it is skipped regardless of translation.
 * Returns the count of newly inserted entries.
 */
export async function mergeVocabIntoWordPool(
  language: string,
  entries: Array<{ phrase: string; translation: string }>
): Promise<number> {
  if (entries.length === 0) return 0;

  const existing = await db
    .select({ phrase: wordPoolTable.phrase })
    .from(wordPoolTable)
    .where(eq(wordPoolTable.language, language));

  const existingPhrases = new Set(existing.map((r) => r.phrase));

  const toInsert: Array<{ language: string; phrase: string; translation: string }> = [];
  const seen = new Set<string>();

  for (const e of entries) {
    const p = e.phrase.trim();
    if (!p) continue;
    if (existingPhrases.has(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    toInsert.push({ language, phrase: p, translation: e.translation.trim() });
  }

  if (toInsert.length === 0) return 0;

  await db.insert(wordPoolTable).values(toInsert);
  return toInsert.length;
}

/**
 * GET /word-pool/stats
 * Returns the word count per language: [{language, count}]
 */
router.get("/word-pool/stats", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ language: wordPoolTable.language, count: sql<number>`count(*)::int` })
    .from(wordPoolTable)
    .groupBy(wordPoolTable.language)
    .orderBy(wordPoolTable.language);

  res.json(rows.map((r) => ({ language: r.language, count: r.count })));
});

/**
 * GET /word-pool/world
 * Returns a language-balanced word pool for International Flashcards.
 *
 * Algorithm:
 *   1. Fetch all non-ignored entries, group by language.
 *   2. Find N = the smallest per-language count.
 *   3. Languages with count === N → include all their entries.
 *   4. Languages with count  >  N → include N randomly sampled entries.
 *
 * This ensures every language has an equal share in the session so that
 * languages with many songs don't dominate International Flashcards.
 * The random sample is re-drawn on every request, so different entries
 * surface across sessions.
 */
router.get("/word-pool/world", async (_req, res): Promise<void> => {
  const [allEntries, ignoredRows] = await Promise.all([
    db.select().from(wordPoolTable),
    db
      .select({ wordPoolId: flashcardProgressTable.wordPoolId })
      .from(flashcardProgressTable)
      .where(eq(flashcardProgressTable.ignored, true)),
  ]);

  const ignoredIds = new Set(ignoredRows.map((r) => r.wordPoolId));

  // Group non-ignored entries by language
  const byLanguage = new Map<string, typeof allEntries>();
  for (const e of allEntries) {
    if (ignoredIds.has(e.id)) continue;
    if (!byLanguage.has(e.language)) byLanguage.set(e.language, []);
    byLanguage.get(e.language)!.push(e);
  }

  if (byLanguage.size === 0) {
    res.json([]);
    return;
  }

  // N = smallest language pool size
  const n = Math.min(...[...byLanguage.values()].map((arr) => arr.length));

  // Fisher-Yates shuffle helper
  function sampleN<T>(arr: T[], count: number): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, count);
  }

  const pool: Array<{ id: number; language: string; phrase: string; translation: string }> = [];
  for (const [, entries] of byLanguage) {
    const chosen = entries.length === n ? entries : sampleN(entries, n);
    for (const e of chosen) {
      pool.push({ id: e.id, language: e.language, phrase: e.phrase, translation: e.translation });
    }
  }

  res.json(pool);
});

/**
 * POST /word-pool/delete-entries
 * Permanently deletes a specific set of word pool entries by id.
 *   1. Deletes any flashcard_progress rows tied to those entries.
 *   2. Deletes the word_pool entries themselves.
 * Song-specific exercises are unaffected (they read CSV data, not the pool).
 * Body: { ids: number[] }
 */
router.post("/word-pool/delete-entries", async (req, res): Promise<void> => {
  const { ids } = (req.body ?? {}) as { ids?: unknown };
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: "ids must be an array" });
    return;
  }

  const numericIds = Array.from(
    new Set(
      ids.filter(
        (x): x is number => typeof x === "number" && Number.isInteger(x)
      )
    )
  );

  if (numericIds.length === 0) {
    res.status(400).json({ error: "ids must contain at least one valid id" });
    return;
  }

  const deleted = await db.transaction(async (tx) => {
    await tx
      .delete(flashcardProgressTable)
      .where(inArray(flashcardProgressTable.wordPoolId, numericIds));

    return tx
      .delete(wordPoolTable)
      .where(inArray(wordPoolTable.id, numericIds))
      .returning({ id: wordPoolTable.id });
  });

  res.json({ deletedEntries: deleted.length });
});

/**
 * DELETE /word-pool/:language
 * Wipes every trace of a language from the word pool:
 *   1. Deletes all flashcard_progress rows tied to word_pool entries of this language.
 *   2. Deletes all word_pool entries for this language.
 * Used when deleting the last song in a language and the user confirms "Clear Language".
 */
router.delete("/word-pool/:language", async (req, res): Promise<void> => {
  const { language } = req.params;
  if (!language?.trim()) {
    res.status(400).json({ error: "Language is required" });
    return;
  }

  const entries = await db
    .select({ id: wordPoolTable.id })
    .from(wordPoolTable)
    .where(eq(wordPoolTable.language, language));

  const ids = entries.map((e) => e.id);

  if (ids.length > 0) {
    await db
      .delete(flashcardProgressTable)
      .where(inArray(flashcardProgressTable.wordPoolId, ids));
  }

  const deleted = await db
    .delete(wordPoolTable)
    .where(eq(wordPoolTable.language, language))
    .returning({ id: wordPoolTable.id });

  res.json({ language, deletedEntries: deleted.length });
});

/**
 * GET /word-pool/:language
 * Returns all word pool entries for the given language, including whether
 * each entry has been individually ignored (from flashcard_progress).
 * Sorted alphabetically by phrase.
 */
router.get("/word-pool/:language", async (req, res): Promise<void> => {
  const { language } = req.params;
  if (!language || !language.trim()) {
    res.status(400).json({ error: "Language is required" });
    return;
  }

  const entries = await db
    .select({
      id: wordPoolTable.id,
      language: wordPoolTable.language,
      phrase: wordPoolTable.phrase,
      translation: wordPoolTable.translation,
      ignored: flashcardProgressTable.ignored,
    })
    .from(wordPoolTable)
    .leftJoin(
      flashcardProgressTable,
      eq(wordPoolTable.id, flashcardProgressTable.wordPoolId)
    )
    .where(eq(wordPoolTable.language, language))
    .orderBy(wordPoolTable.phrase);

  res.json(
    entries.map((e) => ({
      id: e.id,
      language: e.language,
      phrase: e.phrase,
      translation: e.translation,
      ignored: e.ignored ?? false,
    }))
  );
});

/**
 * POST /word-pool/initialize
 * Idempotent: builds the word pool from all existing songs' vocab.
 * Can be called multiple times safely — duplicates are skipped.
 * Returns a summary of how many entries were added per language.
 */
router.post("/word-pool/initialize", async (_req, res): Promise<void> => {
  const songs = await db
    .select({ id: songsTable.id, language: songsTable.language })
    .from(songsTable)
    .orderBy(songsTable.id);

  if (songs.length === 0) {
    res.json({ message: "No songs found", added: {} });
    return;
  }

  const songIds = songs.map((s) => s.id);
  const allVocab = await db
    .select()
    .from(vocabTable)
    .where(inArray(vocabTable.songId, songIds));

  const songLanguageMap = new Map(songs.map((s) => [s.id, s.language]));

  const byLanguage = new Map<string, Array<{ phrase: string; translation: string }>>();
  for (const v of allVocab) {
    const lang = songLanguageMap.get(v.songId);
    if (!lang) continue;
    if (!byLanguage.has(lang)) byLanguage.set(lang, []);
    byLanguage.get(lang)!.push({ phrase: v.phrase, translation: v.translation });
  }

  const summary: Record<string, number> = {};
  for (const [lang, entries] of byLanguage) {
    const added = await mergeVocabIntoWordPool(lang, entries);
    summary[lang] = added;
  }

  res.json({ message: "Initialization complete", added: summary });
});

export default router;
