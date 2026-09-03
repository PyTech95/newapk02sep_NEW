import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/src/context/AuthContext";
import { ToastProvider } from "@/src/context/ToastContext";
import { LiveOverlays } from "@/src/components/LiveOverlays";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import "@/src/services/backgroundLocation";
import { colors } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Foreground display behaviour — module scope, before any component.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Android channel — module scope so it exists before any push arrives.
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "ChakraPetch-Bold": require("../assets/fonts/ChakraPetch-Bold.ttf"),
    "ChakraPetch-SemiBold": require("../assets/fonts/ChakraPetch-SemiBold.ttf"),
    "ChakraPetch-Medium": require("../assets/fonts/ChakraPetch-Medium.ttf"),
    Outfit: require("../assets/fonts/Outfit-Variable.ttf"),
  });

  const iconsReady = iconsLoaded || iconsError;
  const fontsReady = fontsLoaded || fontsError;

  useEffect(() => {
    if (iconsReady && fontsReady) SplashScreen.hideAsync();
  }, [iconsReady, fontsReady]);

  // Notification tap handling (native only).
  useEffect(() => {
    if (Platform.OS === "web") return;

    const openFromData = (data: any) => {
      // Prefer an explicit incident id so a tapped alert lands on the reply screen.
      const incidentId =
        data?.incident_id || data?.incidentId || data?.incident || null;
      if (incidentId) {
        router.push({ pathname: "/incident-detail", params: { id: String(incidentId) } });
        return;
      }

      const url = data?.deeplink || data?.action_url || data?.url;
      if (url) {
        // Turn a neksathi incident/scan web link into an in-app reply screen.
        const m = String(url).match(/\/(?:incident|scan|i)\/([\w-]+)/);
        if (m) {
          router.push({ pathname: "/incident-detail", params: { id: m[1] } });
          return;
        }
        if (String(url).startsWith("http")) {
          Linking.openURL(url);
          return;
        }
        router.push(url);
        return;
      }

      // Fallback: any alert/scan notification should still open the inbox so a
      // tap never does nothing.
      router.push("/incidents-inbox");
    };

    // Warm tap — app already open.
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromData(response.notification.request.content.data || {});
    });

    // Cold-start tap — app was killed.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromData(response.notification.request.content.data || {});
    });

    return () => tapSub.remove();
  }, []);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!iconsReady || !fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ToastProvider>
            <AuthProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="qr-detail" options={{ presentation: "modal" }} />
              </Stack>
              <LiveOverlays />
            </AuthProvider>
          </ToastProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
