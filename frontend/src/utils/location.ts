import * as Battery from "expo-battery";
import * as Location from "expo-location";

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface LocationResult {
  coords?: Coords;
  error?: string;
  blocked?: boolean; // permanently denied — offer Open Settings
}

// Contextual foreground-location request with full permission-state handling.
export async function requestLocation(): Promise<LocationResult> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    let status = current.status;
    let canAskAgain = current.canAskAgain;

    if (status !== Location.PermissionStatus.GRANTED) {
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
      canAskAgain = req.canAskAgain;
    }

    if (status !== Location.PermissionStatus.GRANTED) {
      return { error: "Location permission is needed to share your position.", blocked: !canAskAgain };
    }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } };
  } catch {
    return { error: "Could not get your current location." };
  }
}

export async function getBatteryPercent(): Promise<number | undefined> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level < 0) return undefined;
    return Math.round(level * 100);
  } catch {
    return undefined;
  }
}
