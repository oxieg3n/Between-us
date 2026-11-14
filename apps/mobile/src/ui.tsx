import { useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { useAppearance } from "./appearance";
import { typography, type Theme } from "./theme";

export function Button({
  label,
  onPress,
  primary = false,
  disabled = false,
  quiet = false,
  theme,
  testID,
  selected,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  quiet?: boolean;
  theme?: Theme;
  testID?: string;
  selected?: boolean;
}) {
  const { theme: current } = useAppearance();
  const t = theme ?? current;
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{
        disabled,
        selected: selected ?? label.startsWith("●"),
      }}
      {...(Platform.OS === "web" && selected !== undefined
        ? { "aria-pressed": selected }
        : {})}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary
            ? t.primary
            : selected
              ? t.soft
              : quiet
                ? "transparent"
                : t.surface,
          borderColor:
            focused || selected ? t.primary : quiet ? "transparent" : t.border,
          borderWidth: focused || selected ? 2 : 1,
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: primary ? t.onPrimary : selected || quiet ? t.primary : t.text,
          fontSize: 16,
          lineHeight: 23,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Heading({
  children,
  large = false,
  style,
}: {
  children: ReactNode;
  large?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useAppearance();
  return (
    <Text
      accessibilityRole="header"
      style={[
        large ? typography.display : typography.heading,
        {
          color: theme.text,
          fontFamily: Platform.select({
            ios: "Georgia",
            android: "serif",
            default: "Georgia, serif",
          }),
          fontWeight: "400",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted = false,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useAppearance();
  return (
    <Text
      style={[
        typography.body,
        { color: muted ? theme.muted : theme.text },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const { theme } = useAppearance();
  return (
    <Text
      style={{
        color: theme.muted,
        fontSize: 12,
        lineHeight: 18,
        letterSpacing: 1.3,
        fontWeight: "600",
      }}
    >
      {children}
    </Text>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  testID?: string;
}) {
  const { theme: t } = useAppearance();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.text, ...typography.label, fontWeight: "600" }}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        maxLength={multiline ? 5000 : 150}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={t.primary}
        style={[
          styles.field,
          multiline && styles.writing,
          {
            backgroundColor: t.surface,
            color: t.text,
            borderColor: focused ? t.primary : t.border,
            borderWidth: focused ? 2 : 1,
          },
        ]}
      />
    </View>
  );
}

export function Paper({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useAppearance();
  return (
    <View
      style={[
        styles.paper,
        { backgroundColor: theme.paper, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider() {
  const { theme } = useAppearance();
  return (
    <View
      style={{ height: 1, backgroundColor: theme.border, alignSelf: "stretch" }}
    />
  );
}

export type IconName =
  | "home"
  | "journal"
  | "chats"
  | "circle"
  | "back"
  | "settings"
  | "plus"
  | "edit"
  | "lock"
  | "send"
  | "arrow"
  | "close";
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const { theme } = useAppearance();
  const common = {
    stroke: color ?? theme.text,
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  const accessibility =
    Platform.OS === "web"
      ? { "aria-hidden": true as const }
      : {
          accessible: false,
          importantForAccessibility: "no-hide-descendants" as const,
        };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...accessibility}>
      {name === "home" && (
        <>
          <Path d="M3 10.5 12 3l9 7.5V21H3Z" {...common} />
          <Path d="M9 21v-8h6v8" {...common} />
        </>
      )}
      {name === "journal" && (
        <>
          <Rect x="5" y="3" width="15" height="18" rx="1" {...common} />
          <Path d="M8 3v18M11 8h6M11 12h6" {...common} />
          <Path d="M3 7h3M3 12h3M3 17h3" {...common} />
        </>
      )}
      {name === "chats" && <Path d="M4 4h16v12H9l-5 4V4Z" {...common} />}
      {name === "circle" && (
        <>
          <Circle cx="8" cy="8" r="3" {...common} />
          <Path
            d="M2 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 5 5v1"
            {...common}
          />
        </>
      )}
      {name === "back" && <Path d="m14 5-7 7 7 7M7 12h14" {...common} />}
      {name === "arrow" && <Path d="M4 12h15m-6-6 6 6-6 6" {...common} />}
      {name === "plus" && <Path d="M12 4v16M4 12h16" {...common} />}
      {name === "close" && <Path d="m5 5 14 14M19 5 5 19" {...common} />}
      {name === "edit" && (
        <>
          <Path d="m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4" {...common} />
        </>
      )}
      {name === "lock" && (
        <>
          <Rect x="5" y="10" width="14" height="11" rx="2" {...common} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3" {...common} />
          <Line x1="12" y1="15" x2="12" y2="17" {...common} />
        </>
      )}
      {name === "send" && (
        <Path d="m3 3 18 9-18 9 4-9-4-9ZM7 12h14" {...common} />
      )}
      {name === "settings" && (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path
            d="m10 3-.6 2.5-2.1 1.2L5 6l-2 3.5 1.8 1.7v2.4L3 15.3l2 3.5 2.3-.7 2.1 1.2.6 2.5h4l.6-2.5 2.1-1.2 2.3.7 2-3.5-1.8-1.7v-2.4L21 9.5 19 6l-2.3.7-2.1-1.2L14 3Z"
            {...common}
          />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
  },
  field: {
    minHeight: 52,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    lineHeight: 26,
  },
  writing: { minHeight: 170, textAlignVertical: "top", ...typography.writing },
  paper: { padding: 22, borderWidth: 1, borderRadius: 12, gap: 16 },
});
