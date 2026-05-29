import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const timestampsTable = pgTable("song_timestamps", {
  id: serial("id").primaryKey(),
  songId: integer("song_id").notNull(),
  lineIndex: integer("line_index").notNull(),
  timestampMs: integer("timestamp_ms").notNull(),
});

export const insertTimestampSchema = createInsertSchema(timestampsTable).omit({ id: true });
export type InsertTimestamp = z.infer<typeof insertTimestampSchema>;
export type Timestamp = typeof timestampsTable.$inferSelect;
