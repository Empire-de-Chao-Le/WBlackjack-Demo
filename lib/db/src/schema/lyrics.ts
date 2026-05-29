import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lyricsTable = pgTable("lyrics", {
  id: serial("id").primaryKey(),
  songId: integer("song_id").notNull(),
  lineIndex: integer("line_index").notNull(),
  original: text("original").notNull(),
  translation: text("translation").notNull(),
  distractor1: text("distractor1"),
  distractor2: text("distractor2"),
  distractor3: text("distractor3"),
  distractor4: text("distractor4"),
});

export const insertLyricSchema = createInsertSchema(lyricsTable).omit({ id: true });
export type InsertLyric = z.infer<typeof insertLyricSchema>;
export type Lyric = typeof lyricsTable.$inferSelect;
