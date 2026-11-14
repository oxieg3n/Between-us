import { useState } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import type { Theme } from "./theme";
export function Button({
  label,
  onPress,
  primary = false,
  disabled = false,
  theme: t,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  theme: Theme;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: label.startsWith("?") }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? t.primary : t.surface,
          borderColor: focused ? t.text : t.border,
          borderWidth: focused ? 3 : 1,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: primary ? t.onPrimary : t.text,
          fontSize: 16,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 17,
    paddingVertical: 13,
    justifyContent: "center",
  },
});
