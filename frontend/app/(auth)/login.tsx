import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { AuthShell } from "@/src/components/AuthShell";
import { Field } from "@/src/components/Field";
import { NeonButton } from "@/src/components/NeonButton";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing } from "@/src/theme";

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!email.trim() || !password) {
      toast("Enter email and password", "error");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast("Welcome back!", "success");
    } catch (e) {
      toast(errMessage(e, "Login failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail("e1tester1788162692@gmail.com");
    setPassword("Test@1234");
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your safety command center"
      footer={
        <View style={styles.footer}>
          <Text style={styles.footerText}>New to NekSathi?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable testID="go-register-link">
              <Text style={styles.link}>Create account</Text>
            </Pressable>
          </Link>
        </View>
      }
    >
      <Field
        label="EMAIL"
        icon="mail"
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        testID="login-email-input"
      />
      <Field
        label="PASSWORD"
        icon="lock"
        placeholder="Your password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        testID="login-password-input"
      />
      <NeonButton label="Log in" icon="log-in" onPress={onLogin} loading={loading} testID="login-submit-button" />

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.line} />
      </View>

      <NeonButton
        label="Continue with phone OTP"
        variant="ghost"
        icon="smartphone"
        onPress={() => router.push("/(auth)/otp")}
        testID="go-otp-button"
      />
      <Pressable testID="fill-demo-button" onPress={fillDemo} style={styles.demo}>
        <Text style={styles.demoText}>Use test account</Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.xs },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm },
  demo: { alignItems: "center", paddingVertical: spacing.xs },
  demoText: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, textDecorationLine: "underline" },
  footer: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl, alignItems: "center" },
  footerText: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base },
  link: { color: colors.cyan, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
});
