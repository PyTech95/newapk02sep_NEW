// Guardian Schedule — auto enable/disable Background Guardian within a daily
// window (e.g. school commute). Reconciled whenever the app becomes active or
// the Safety screen is focused (a fully-killed app can't self-trigger, but it
// catches up on next open and the foreground-service keeps it alive once on).

import { storage } from "@/src/utils/storage";

import { isGuardianRunning, startGuardian, stopGuardian } from "./backgroundLocation";

export const SCHEDULE_KEY = "neksathi_guardian_schedule";

export interface GuardianSchedule {
  enabled: boolean;
  start: number; // minutes from midnight
  end: number; // minutes from midnight
  days: number[]; // 0 = Sun … 6 = Sat; empty = every day
}

export const DEFAULT_SCHEDULE: GuardianSchedule = {
  enabled: false,
  start: 7 * 60 + 30,
  end: 9 * 60,
  days: [1, 2, 3, 4, 5],
};

export async function getSchedule(): Promise<GuardianSchedule> {
  const raw = await storage.getItem(SCHEDULE_KEY, "");
  if (!raw) return DEFAULT_SCHEDULE;
  try {
    return { ...DEFAULT_SCHEDULE, ...JSON.parse(raw as string) };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export async function saveSchedule(s: GuardianSchedule): Promise<void> {
  await storage.setItem(SCHEDULE_KEY, JSON.stringify(s));
}

export function isWithinWindow(s: GuardianSchedule, now = new Date()): boolean {
  if (!s.enabled) return false;
  const day = now.getDay();
  if (s.days.length && !s.days.includes(day)) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (s.start === s.end) return true;
  if (s.start < s.end) return mins >= s.start && mins < s.end;
  // overnight window (e.g. 22:00 -> 06:00)
  return mins >= s.start || mins < s.end;
}

// Brings Guardian in line with the schedule. Returns what it changed.
export async function reconcileSchedule(): Promise<"started" | "stopped" | null> {
  const s = await getSchedule();
  if (!s.enabled) return null;
  const within = isWithinWindow(s);
  const running = await isGuardianRunning();
  if (within && !running) {
    const r = await startGuardian();
    return r.ok ? "started" : null;
  }
  if (!within && running) {
    await stopGuardian();
    return "stopped";
  }
  return null;
}

export const minutesToLabel = (m: number): string => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
};

export const dateToMinutes = (d: Date): number => d.getHours() * 60 + d.getMinutes();
export const minutesToDate = (m: number): Date => {
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
};
