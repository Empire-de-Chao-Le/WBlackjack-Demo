import { useQuery } from "@tanstack/react-query";

export type WordPoolStat = { language: string; count: number };

async function fetchWordPoolStats(): Promise<WordPoolStat[]> {
  const res = await fetch("/api/word-pool/stats");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useWordPoolStats() {
  return useQuery({
    queryKey: ["word-pool-stats"],
    queryFn: fetchWordPoolStats,
  });
}
