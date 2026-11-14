import { AppProvider, useApp, type Screen } from "../state";
import { useAppearance } from "../appearance";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Body, Button, Heading, Icon, type IconName } from "../ui";
import {
  HomeScreen,
  OnboardingScreen,
  SafetyScreen,
  SettingsScreen,
} from "../screens/Home";
import { JournalEditor, JournalOverview } from "../screens/Journal";
import {
  ChatsList,
  ConversationDetail,
  ConversationComposer,
  ComposeScreen,
  ReviewScreen,
} from "../screens/Messaging";
import { CircleScreen, ContactScreen } from "../screens/Circle";
import { CheckinsScreen, SchedulerScreen } from "../screens/Checkins";
const tabs: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: "Home", label: "Home", icon: "home" },
  { screen: "Journal", label: "Journal", icon: "journal" },
  { screen: "Chats", label: "Chats", icon: "chats" },
  { screen: "Circle", label: "Circle", icon: "circle" },
];
const titles: Record<Screen, string> = {
  Home: "Between Us",
  Journal: "My Journal",
  JournalEditor: "A page for you",
  Chats: "Conversations",
  Conversation: "Conversation",
  Compose: "Find the words",
  Review: "Review your words",
  Circle: "My Circle",
  Contact: "Trusted person",
  Checkins: "Open the Door",
  Scheduler: "Schedule a check-in",
  Settings: "Profile & appearance",
  Safety: "Privacy & safety",
  Onboarding: "Between Us",
};
function Application() {
  const { screen, tab, go, back, notice, dialog, setDialog, scheduleId } =
    useApp();
  const { theme: t } = useAppearance();
  const { width } = useWindowDimensions();
  const rail = width >= 760;
  const [focusedTab, setFocusedTab] = useState("");
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const selected =
    screen === "JournalEditor"
      ? "Journal"
      : ["Conversation", "Compose", "Review"].includes(screen)
        ? "Chats"
        : screen === "Contact"
          ? "Circle"
          : screen;
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [screen]);
  const navigation = (
    <View
      accessibilityRole="tablist"
      style={[
        styles.nav,
        rail ? styles.rail : styles.bottom,
        { borderColor: t.border, backgroundColor: t.background },
      ]}
    >
      {tabs.map((item) => (
        <Pressable
          key={item.screen}
          accessibilityRole="tab"
          aria-selected={selected === item.screen}
          accessibilityLabel={item.label}
          accessibilityState={{ selected: selected === item.screen }}
          onPress={() => tab(item.screen)}
          onFocus={() => setFocusedTab(item.screen)}
          onBlur={() => setFocusedTab("")}
          style={({ pressed }) => [
            styles.tab,
            {
              backgroundColor:
                selected === item.screen ? t.soft : "transparent",
              opacity: pressed ? 0.7 : 1,
              borderWidth: focusedTab === item.screen ? 2 : 0,
              borderColor: t.primary,
            },
          ]}
        >
          <Icon
            name={item.icon}
            color={selected === item.screen ? t.primary : t.muted}
          />
          <Text
            style={{
              color: selected === item.screen ? t.primary : t.muted,
              fontSize: 12,
              fontWeight: selected === item.screen ? "700" : "400",
              textAlign: "center",
            }}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  const screens: Record<Screen, React.ReactNode> = {
    Home: <HomeScreen />,
    Journal: <JournalOverview />,
    JournalEditor: <JournalEditor />,
    Chats: <ChatsList />,
    Conversation: <ConversationDetail />,
    Compose: <ComposeScreen />,
    Review: <ReviewScreen />,
    Circle: <CircleScreen />,
    Contact: <ContactScreen />,
    Checkins: <CheckinsScreen />,
    Scheduler: <SchedulerScreen key={scheduleId} />,
    Settings: <SettingsScreen />,
    Safety: <SafetyScreen />,
    Onboarding: <OnboardingScreen />,
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <StatusBar style={t.name === "Night Harbor" ? "light" : "dark"} />
      <View style={[styles.header, { borderColor: t.border }]}>
        {tabs.some((x) => x.screen === screen) || screen === "Onboarding" ? (
          <View style={styles.brand}>
            <Image
              source={require("../../assets/brand/symbol.png")}
              accessibilityLabel="Between Us approved symbol"
              style={{ width: 36, height: 36, resizeMode: "contain" }}
            />
            <Text style={{ color: t.text, fontSize: 19, fontWeight: "600" }}>
              Between Us
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={back}
            style={styles.back}
          >
            <Icon name="back" />
            <Text style={{ color: t.text, fontSize: 16 }}>Back</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile & settings"
          onPress={() => go("Settings")}
          style={styles.settings}
        >
          <Icon name="settings" />
        </Pressable>
      </View>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {rail && screen !== "Onboarding" && navigation}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            key={screen}
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[styles.content, rail && { maxWidth: 720 }]}
            onContentSizeChange={() => {
              if (screen === "Conversation")
                scroll.current?.scrollToEnd({ animated: false });
            }}
          >
            {screen !== "Home" && screen !== "Onboarding" && (
              <View style={{ marginBottom: 8 }}>
                <Text
                  accessibilityRole="header"
                  style={{ color: t.muted, fontSize: 15, fontWeight: "600" }}
                >
                  {titles[screen]}
                </Text>
              </View>
            )}
            <Text style={{ color: t.muted, fontSize: 11, letterSpacing: 0.5 }}>
              FICTIONAL DEMO · MEMORY ONLY
            </Text>
            {!!notice && (
              <View
                style={[
                  styles.notice,
                  { backgroundColor: t.soft, borderColor: t.border },
                ]}
              >
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={{ color: t.text, fontSize: 15, lineHeight: 23 }}
                >
                  {notice}
                </Text>
              </View>
            )}
            {screens[screen]}
            {![
              "Safety",
              "Settings",
              "Circle",
              "Contact",
              "Onboarding",
              "Conversation",
            ].includes(screen) && (
              <View style={{ marginTop: 20 }}>
                <Button
                  quiet
                  label="Privacy & safety"
                  onPress={() => go("Safety")}
                />
              </View>
            )}
          </ScrollView>
          {screen === "Conversation" && <ConversationComposer />}
        </KeyboardAvoidingView>
      </View>
      {!rail && screen !== "Onboarding" && navigation}
      <Modal
        visible={!!dialog}
        transparent
        animationType="none"
        onRequestClose={() => setDialog(null)}
      >
        <View style={styles.scrim}>
          <View
            accessibilityViewIsModal
            style={[
              styles.dialog,
              { backgroundColor: t.surface, borderColor: t.border },
            ]}
          >
            <Heading>{dialog?.title}</Heading>
            <Body>{dialog?.body}</Body>
            <Button
              label="Confirm"
              primary
              onPress={() => {
                const action = dialog?.action;
                setDialog(null);
                action?.();
              }}
            />
            <Button label="Cancel" quiet onPress={() => setDialog(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <AppProvider>
      <Application />
    </AppProvider>
  );
}
const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    borderBottomWidth: 1,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", gap: 10, alignItems: "center" },
  settings: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  back: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 },
  content: {
    paddingHorizontal: 26,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 20,
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
    flexGrow: 1,
  },
  nav: { gap: 4, padding: 8 },
  bottom: { borderTopWidth: 1, flexDirection: "row" },
  rail: { width: 110, borderRightWidth: 1, paddingTop: 28, gap: 18 },
  tab: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
  },
  notice: { borderWidth: 1, padding: 14, borderRadius: 8 },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    gap: 20,
    maxWidth: 460,
    width: "100%",
    alignSelf: "center",
  },
});
