import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { otpRequest } from "@/src/api/endpoints";
import { AuthShell } from "@/src/components/AuthShell";
import { Field } from "@/src/components/Field";
import { NeonButton } from "@/src/components/NeonButton";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing } from "@/src/theme";

export default function Otp() {
  const { verifyOtp } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onRequest = async () => {
    if (!phone.trim()) {
      toast("Enter your phone number", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await otpRequest(phone.trim());
      setSent(true);
      if (res.dev_code) {
        setCode(res.dev_code);
        toast(`Dev code: ${res.dev_code}`, "info");
      } else {
        toast("Code sent via WhatsApp", "success");
      }
    } catch (e) {
      toast(errMessage(e, "Could not send code"), "error");
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    if (!code.trim()) {
      toast("Enter the code", "error");
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(phone.trim(), code.trim(), name.trim() || undefined);
      toast("Verified!", "success");
    } catch (e) {
      toast(errMessage(e, "Verification failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Phone login"
      subtitle={sent ? "Enter the code we sent you" : "We'll send a code to your WhatsApp"}
      footer={
        <View style={styles.footer}>
          <Pressable testID="back-to-login-link" onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.link}>Back to email login</Text>
          </Pressable>
        </View>
      }
    >
      <Field
        label="PHONE"
        icon="phone"
        placeholder="+91XXXXXXXXXX"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={!sent}
        testID="otp-phone-input"
      />
      {!sent ? (
        <NeonButton label="Send code" icon="send" onPress={onRequest} loading={loading} testID="otp-request-button" />
      ) : (
        <>
          <Field label="CODE" icon="hash" placeholder="6-digit code" keyboardType="number-pad" value={code} onChangeText={setCode} testID="otp-code-input" />
          <Field label="NAME (if new)" icon="user" placeholder="Optional for new users" value={name} onChangeText={setName} testID="otp-name-input" />
          <NeonButton label="Verify & continue" icon="check" onPress={onVerify} loading={loading} testID="otp-verify-button" />
          <Pressable testID="otp-resend-button" onPress={onRequest} style={styles.resend}>
            <Text style={styles.resendText}>Resend code</Text>
          </Pressable>
        </>
      )}
      <Text style={styles.note}>Codes are delivered over WhatsApp for your privacy.</Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  resend: { alignItems: "center", paddingVertical: spacing.xs },
  resendText: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, textDecorationLine: "underline" },
  note: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, textAlign: "center", marginTop: spacing.xs },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  link: { color: colors.cyan, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
});
