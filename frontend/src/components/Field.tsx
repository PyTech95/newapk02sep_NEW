import { Feather } from "@expo/vector-icons";
import React, { forwardRef } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

interface Props extends TextInputProps {
  label?: string;
  icon?: keyof typeof Feather.glyphMap;
}

export const Field = forwardRef<TextInput, Props>(({ label, icon, style, ...rest }, ref) => {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrap}>
        {icon && <Feather name={icon} size={18} color={colors.textDim} style={styles.icon} />}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textDim}
          style={[styles.input, style]}
          {...rest}
        />
      </View>
    </View>
  );
});
Field.displayName = "Field";

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.textMuted, fontFamily: fonts.displayMedium, fontSize: fontSize.sm, letterSpacing: 0.4 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  icon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    paddingVertical: spacing.md + 2,
  },
});
