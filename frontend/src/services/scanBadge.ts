// Tracks whether new scans (incidents + alerts) have arrived since the owner
// last viewed the Security area — powers the red dot on the Security tab.

import { listAlerts, listIncidents } from "@/src/api/endpoints";
import { storage } from "@/src/utils/storage";

const SEEN_KEY = "neksathi_scan_seen_count";

export async function fetchScanCount(): Promise<number> {
  try {
    const [inc, alerts] = await Promise.all([
      listIncidents().catch(() => ({ count: 0, results: [] })),
      listAlerts().catch(() => []),
    ]);
    const incCount = typeof inc.count === "number" ? inc.count : (inc.results?.length ?? 0);
    return incCount + (alerts?.length ?? 0);
  } catch {
    return 0;
  }
}

export async function getSeenCount(): Promise<number> {
  return (await storage.getItem(SEEN_KEY, 0)) ?? 0;
}

export async function markScansSeen(count: number): Promise<void> {
  await storage.setItem(SEEN_KEY, count);
}
