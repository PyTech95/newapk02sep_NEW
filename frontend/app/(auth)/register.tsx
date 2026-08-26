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

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password) {
      toast("Please fill all fields", "error");
      return;
    }
    if (password.length < 6) {
      toast("Password must be at least 6 characters", "error");
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim().toLowerCase(), phone.trim(), password);
      toast("Account created!", "success");
    } catch (e) {
      toast(errMessage(e, "Registration failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Set up SOS, family & anti-theft in minutes"
      footer={
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable testID="go-login-link">
              <Text style={styles.link}>Log in</Text>
            </Pressable>
          </Link>
        </View>
      }
    >
      <Field label="FULL NAME" icon="user" placeholder="Your name" value={name} onChangeText={setName} testID="register-name-input" />
      <Field
        label="EMAIL"
        icon="mail"
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        testID="register-email-input"
      />
      <Field
        label="PHONE"
        icon="phone"
        placeholder="+91XXXXXXXXXX"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        testID="register-phone-input"
      />
      <Field label="PASSWORD" icon="lock" placeholder="Min 6 characters" secureTextEntry value={password} onChangeText={setPassword} testID="register-password-input" />
      <NeonButton label="Create account" icon="user-plus" onPress={onRegister} loading={loading} testID="register-submit-button" />
      <NeonButton label="Verify with phone OTP" variant="ghost" icon="smartphone" onPress={() => router.push("/(auth)/otp")} testID="go-otp-button" />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl, alignItems: "center" },
  footerText: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base },
  link: { color: colors.cyan, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
});
