// Safety Check-In — a "dead-man's switch": if the user doesn't check in before
// the deadline, NekSathi auto-fires an SOS. Reconciled when the app is active.

import { triggerSos } from "@/src/api/endpoints";
import { storage } from "@/src/utils/storage";
import { requestLocation } from "@/src/utils/location";

const KEY = "neksathi_checkin";

export interface CheckIn {
  active: boolean;
  deadline: string; // ISO
}

export async function getCheckIn(): Promise<CheckIn | null> {
  const raw = await storage.getItem(KEY, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw as string);
  } catch {
    return null;
  }
}

export async function startCheckIn(minutes: number): Promise<void> {
  const deadline = new Date(Date.now() + minutes * 60000).toISOString();
  await storage.setItem(KEY, JSON.stringify({ active: true, deadline }));
}

export async function clearCheckIn(): Promise<void> {
  await storage.setItem(KEY, JSON.stringify({ active: false, deadline: "" }));
}

// If the deadline has passed, auto-fire one SOS and clear. Returns true if fired.
export async function reconcileCheckIn(): Promise<boolean> {
  const c = await getCheckIn();
  if (!c || !c.active || !c.deadline) return false;
  if (Date.now() < new Date(c.deadline).getTime()) return false;
  await clearCheckIn();
  const loc = await requestLocation();
  const lat = loc.coords?.latitude ?? 0;
  const lng = loc.coords?.longitude ?? 0;
  try {
    await triggerSos(lat, lng, "Auto-SOS: safety check-in missed");
    return true;
  } catch {
    return false;
  }
}
