import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/src/context/AuthContext";
import { ToastProvider } from "@/src/context/ToastContext";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import "@/src/services/backgroundLocation";
import { colors } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
            </AuthProvider>
          </ToastProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
