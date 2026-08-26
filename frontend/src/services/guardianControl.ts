// Guardian control — combines the daily Schedule and the "Auto-arm on leaving a
// safe zone" geofence rule to decide whether Background Guardian should be on.
// If neither automation is enabled, the manual Safety switch is left untouched.

import { listSafeZones } from "@/src/api/endpoints";
import { storage } from "@/src/utils/storage";
import { requestLocation } from "@/src/utils/location";

import { isGuardianRunning, startGuardian, stopGuardian } from "./backgroundLocation";
import { getSchedule, isWithinWindow } from "./guardianSchedule";

export const AUTOARM_KEY = "neksathi_guardian_autoarm";

export async function getAutoArm(): Promise<boolean> {
  return (await storage.getItem(AUTOARM_KEY, false)) === true;
}
export async function setAutoArm(v: boolean): Promise<void> {
  await storage.setItem(AUTOARM_KEY, v);
}

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// true = outside every safe zone, false = inside one, null = can't determine
async function outsideAllZones(): Promise<boolean | null> {
  const zones = await listSafeZones().catch(() => []);
  if (!zones.length) return true; // no zones defined -> treat as "out and about"
  const loc = await requestLocation();
  if (!loc.coords) return null;
  const { latitude, longitude } = loc.coords;
  return !zones.some((z) => distanceM(latitude, longitude, z.latitude, z.longitude) <= z.radius_m);
}

// Reconcile Guardian with schedule + auto-arm rules. Safe to call on app-active.
export async function syncGuardianState(): Promise<void> {
  const sched = await getSchedule();
  const autoArm = await getAutoArm();
  if (!sched.enabled && !autoArm) return; // fully manual — don't touch

  let desired = sched.enabled && isWithinWindow(sched);

  if (!desired && autoArm) {
    const away = await outsideAllZones();
    if (away === null) return; // unknown location — avoid flapping
    if (away) desired = true;
  }

  const running = await isGuardianRunning();
  if (desired && !running) await startGuardian();
  else if (!desired && running) await stopGuardian();
}
