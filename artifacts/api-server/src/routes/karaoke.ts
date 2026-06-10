import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, karaokeResultsTable } from "@workspace/db";

const router: IRouter = Router();

const VALID_TIERS = new Set(["normal", "high", "perfect"]);
const VALID_DIFFICULTIES = new Set([10, 33, 100]);

/**
 * POST /karaoke/result
 * Body: { songId: number, difficulty: 10|33|100, tier: "normal"|"high"|"perfect" }
 * Increments the count for the matching (songId, difficulty, tier) row,
 * inserting it the first time. Returns the updated row.
 */
router.post("/karaoke/result", async (req, res): Promise<void> => {
  const { songId, difficulty, tier } = req.body ?? {};

  if (typeof songId !== "number" || !Number.isInteger(songId)) {
    res.status(400).json({ error: "songId (integer) is required" });
    return;
  }
  if (typeof difficulty !== "number" || !VALID_DIFFICULTIES.has(difficulty)) {
    res.status(400).json({ error: "difficulty must be 10, 33 or 100" });
    return;
  }
  if (typeof tier !== "string" || !VALID_TIERS.has(tier)) {
    res.status(400).json({ error: "tier must be normal, high or perfect" });
    return;
  }

  const now = new Date();
  const [row] = await db
    .insert(karaokeResultsTable)
    .values({ songId, difficulty, tier, count: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: [
        karaokeResultsTable.songId,
        karaokeResultsTable.difficulty,
        karaokeResultsTable.tier,
      ],
      set: {
        count: sql`${karaokeResultsTable.count} + 1`,
        updatedAt: now,
      },
    })
    .returning();

  res.json({
    songId: row.songId,
    difficulty: row.difficulty,
    tier: row.tier,
    count: row.count,
  });
});

/**
 * GET /karaoke/results/:songId
 * Returns every recorded tier count for the song:
 *   [{ difficulty, tier, count }, ...]
 */
router.get("/karaoke/results/:songId", async (req, res): Promise<void> => {
  const songId = parseInt(req.params.songId, 10);
  if (!Number.isInteger(songId)) {
    res.status(400).json({ error: "songId must be an integer" });
    return;
  }

  const rows = await db
    .select({
      difficulty: karaokeResultsTable.difficulty,
      tier: karaokeResultsTable.tier,
      count: karaokeResultsTable.count,
    })
    .from(karaokeResultsTable)
    .where(eq(karaokeResultsTable.songId, songId));

  res.json(rows);
});

export default router;
