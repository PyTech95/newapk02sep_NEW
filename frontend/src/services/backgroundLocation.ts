// Background Guardian — pings the user's location to the backend every ~60s,
// even when the app is backgrounded (Android foreground service).
// NOTE: background location requires a real dev/prod build — it does NOT work
// in Expo Go or on web. Callers surface that to the user.

import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { TOKEN_KEY } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

export const GUARDIAN_TASK = "neksathi-location-ping";
export const GUARDIAN_ENABLED_KEY = "neksathi_guardian_enabled";

// Define the headless task at module scope (skip on web where it's unsupported).
if (Platform.OS !== "web") {
  try {
    TaskManager.defineTask(GUARDIAN_TASK, async ({ data, error }: any) => {
      if (error) return;
      const locations = data?.locations as Location.LocationObject[] | undefined;
      if (!locations?.length) return;
      const token = await storage.secureGet(TOKEN_KEY, "");
      if (!token) return;

      let battery: number | undefined;
      try {
        const lvl = await Battery.getBatteryLevelAsync();
        if (lvl >= 0) battery = Math.round(lvl * 100);
      } catch {}

      const loc = locations[locations.length - 1];
      try {
        await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/me/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            battery,
          }),
        });
      } catch {}
    });
  } catch {}
}

export async function isGuardianRunning(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(GUARDIAN_TASK);
  } catch {
    return false;
  }
}

export interface GuardianResult {
  ok: boolean;
  error?: string;
  blocked?: boolean;
}

export async function startGuardian(): Promise<GuardianResult> {
  if (Platform.OS === "web") {
    return { ok: false, error: "Background Guardian works on the installed app, not the web preview." };
  }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) {
    return { ok: false, error: "Location permission is required.", blocked: !fg.canAskAgain };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== Location.PermissionStatus.GRANTED) {
    return {
      ok: false,
      error: "Set location to 'Allow all the time' so Guardian keeps sharing when the app is closed.",
      blocked: !bg.canAskAgain,
    };
  }
  try {
    if (!(await isGuardianRunning())) {
      await Location.startLocationUpdatesAsync(GUARDIAN_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60000,
        distanceInterval: 0,
        deferredUpdatesInterval: 60000,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: "NekSathi Guardian is active",
          notificationBody: "Sharing your live location with family every minute.",
          notificationColor: "#22d3ee",
        },
      });
    }
    await storage.setItem(GUARDIAN_ENABLED_KEY, true);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not start Guardian. A real device build is required." };
  }
}

export async function stopGuardian(): Promise<void> {
  try {
    if (await isGuardianRunning()) await Location.stopLocationUpdatesAsync(GUARDIAN_TASK);
  } catch {}
  await storage.setItem(GUARDIAN_ENABLED_KEY, false);
}
