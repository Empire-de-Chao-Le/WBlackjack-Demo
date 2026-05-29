import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const songsTable = pgTable("songs", {
  id: serial("id").primaryKey(),
  artist: text("artist").notNull(),
  title: text("title").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  youtubeThumbnailUrl: text("youtube_thumbnail_url"),
  language: text("language").notNull(),
  status: text("status").notNull().default("new"),
  timesPlayed: integer("times_played").notNull().default(0),
  dateAdded: timestamp("date_added", { withTimezone: true }).notNull().defaultNow(),
  lastPlayed: timestamp("last_played", { withTimezone: true }),
});

export const insertSongSchema = createInsertSchema(songsTable).omit({
  id: true,
  dateAdded: true,
});
export type InsertSong = z.infer<typeof insertSongSchema>;
export type Song = typeof songsTable.$inferSelect;
