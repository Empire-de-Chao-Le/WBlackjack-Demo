import { z } from "zod";

export const EditSongBody = z.object({
  artist: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  youtubeUrl: z.string().min(1).optional(),
  status: z.enum(["new", "active", "done"]).optional(),
  timesPlayed: z.number().int().optional(),
  lastPlayed: z.string().nullable().optional(),
  csvFilename: z.string().optional(),
  vocabCsvFilename: z.string().optional(),
});
