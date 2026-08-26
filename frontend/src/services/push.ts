// Guardian Push Alert — device token registration with the Emergent managed
// push relay. Native only; no-ops on web / Expo Go.
import * as Notifications from "expo-notifications";
import { Alert, Linking, Platform } from "react-native";

import { registerPush } from "@/src/api/endpoints";
import { storage } from "@/src/utils/storage";

const NUDGE_KEY = "pushNudgeAt";

// Ask permission, fetch the native token, and register it against the user.
// Safe to call on every app open — tokens rotate and the backend upserts.
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await registerPush(userId, Platform.OS, String(tokenResp.data));
  } catch {
    // never block app flow on push failures
  }
}

// If the user has permanently denied notifications, nudge them (weekly) toward
// system settings so Guardian alerts can be re-enabled.
export async function maybeNudgeForPush(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== "denied" || canAskAgain) return;
    const last = await storage.getItem(NUDGE_KEY, "");
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (last && Date.now() - Number(last) <= oneWeek) return;
    Alert.alert(
      "Turn on Guardian alerts",
      "Notifications are off, so your family won't be alerted if you trigger an SOS. Enable them in Settings.",
      [
        {
          text: "Later",
          style: "cancel",
          onPress: () => storage.setItem(NUDGE_KEY, String(Date.now())),
        },
        {
          text: "Open Settings",
          onPress: () => {
            storage.setItem(NUDGE_KEY, String(Date.now()));
            Linking.openSettings();
          },
        },
      ],
    );
  } catch {
    // ignore
  }
}
