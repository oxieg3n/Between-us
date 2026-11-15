import { Image, Text, View } from "react-native";
import { useApp } from "../state";
import { useAppearance } from "../appearance";
import { BUILD_ID } from "../build";
import { Body, Button, Divider, Eyebrow, Heading, Icon, Paper } from "../ui";
export function HomeScreen() {
  const { role, compose, go, checkins, messages } = useApp();
  const { theme: t } = useAppearance();
  const recent = messages
    .filter(
      (m) =>
        m.author !== role &&
        m.recipient === (role === "child" ? "sam" : "alex"),
    )
    .at(-1);
  const pending = checkins.find((c) => c.status === "open");
  return (
    <View style={{ gap: 26 }}>
      <View>
        <Eyebrow>A LITTLE ROOM TO CONNECT</Eyebrow>
        <Text style={{ fontSize: 18, color: t.muted, marginTop: 12 }}>
          Hi, {role === "child" ? "Sam" : "Alex"}.
        </Text>
      </View>
      <View style={{ gap: 20, paddingBottom: 12 }}>
        <Heading large>Some things are{"\n"}easier to write.</Heading>
        <Body muted>
          {role === "child"
            ? "A first sentence is enough. You choose who to share it with."
            : "Make a little room for the things you want to say, and the things they want to tell you."}
        </Body>
        <Button label="Talk to someone" primary onPress={() => compose()} />
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: t.border,
          paddingVertical: 6,
        }}
      >
        <View style={{ flex: 1 }}>
          <Button quiet label="Write privately" onPress={() => go("Journal")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button quiet label="My Circle" onPress={() => go("Circle")} />
        </View>
      </View>
      {pending && (
        <View
          style={{
            gap: 12,
            borderLeftWidth: 3,
            borderLeftColor: t.peach,
            paddingLeft: 18,
          }}
        >
          <Eyebrow>OPEN THE DOOR</Eyebrow>
          <Body>{pending.prompt}</Body>
          <Button
            quiet
            label={role === "child" ? "Open check-in" : "View check-ins"}
            onPress={() => go("Checkins")}
          />
        </View>
      )}
      <View style={{ gap: 8 }}>
        <Eyebrow>SMALL TASKS, PERSONAL PLANS</Eyebrow>
        <Button label="Chores & Goals" onPress={() => go("Finance")} />
        <Body muted>Plan allowances and savings together. This demo tracks fictional amounts.</Body>
      </View>
      {recent && (
        <View style={{ gap: 10 }}>
          <Eyebrow>A RECENT CONVERSATION</Eyebrow>
          <Body>{recent.text}</Body>
          <Button
            quiet
            label="Continue the conversation"
            onPress={() => go("Chats")}
          />
        </View>
      )}
      {role === "parent" && (
        <Button
          quiet
          label="Schedule a check-in"
          onPress={() => go("Scheduler")}
        />
      )}
    </View>
  );
}
export function SettingsScreen() {
  const { role, switchRole, go } = useApp();
  const {
    theme: t,
    appearance,
    setAppearance,
    loading,
    error,
    retry,
  } = useAppearance();
  return (
    <View style={{ gap: 22 }}>
      <Heading>Make yourself at home.</Heading>
      <Body muted>Choose the light that feels right for you.</Body>
      <Eyebrow>APPEARANCE</Eyebrow>
      {loading && <Body muted>Loading your appearance preference…</Body>}
      {(
        [
          ["system", "Follow device appearance"],
          ["light", "Light mode"],
          ["dark", "Dark mode"],
        ] as const
      ).map(([mode, label]) => (
        <View
          key={mode}
          style={{
            borderBottomWidth: 1,
            borderColor: t.border,
            paddingBottom: 10,
          }}
        >
          <Button
            label={label}
            selected={appearance === mode}
            onPress={() => setAppearance(mode)}
          />
          <Text style={{ color: t.muted, fontSize: 14, marginTop: 8 }}>
            {mode === "system"
              ? "Changes with your device"
              : mode === "light"
                ? "Safe Harbor"
                : "Night Harbor"}
            {appearance === mode ? " · Selected" : ""}
          </Text>
        </View>
      ))}
      <Body muted>
        Appearance is the only saved preference. Optional model downloads save
        model files. Your journal, messages and fictional finances stay in memory.
      </Body>
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={{ color: t.danger }}>
            {error}
          </Text>
          <Button label="Retry saving appearance" onPress={retry} />
        </>
      )}
      <Divider />
      <Button label="On-device conversation ideas" onPress={() => go("LocalModel")} />
      <Eyebrow>DEMO ACCOUNT</Eyebrow>
      <Body>
        {role === "child" ? "Sam · kid / teen" : "Alex · parent / guardian"}
      </Body>
      <Body muted>
        This account selector is for fictional testing. It is not a secure
        sign-in.
      </Body>
      <Button
        label={
          role === "child" ? "Switch to parent demo" : "Switch to child demo"
        }
        onPress={() => switchRole(role === "child" ? "parent" : "child")}
      />
      <Button quiet label="Privacy & safety" onPress={() => go("Safety")} />
      <Button
        quiet
        label="Welcome to Between Us"
        onPress={() => go("Onboarding")}
      />
      <Divider />
      <Text selectable style={{ color: t.muted, fontSize: 13 }}>
        Build {BUILD_ID}
      </Text>
      <Body muted>Between Us · Powered By Oxieg3n</Body>
    </View>
  );
}
export function SafetyScreen() {
  const { compose } = useApp();
  return (
    <View style={{ gap: 22 }}>
      <Heading>Your words are yours.</Heading>
      <Paper>
        <Icon name="lock" />
        <Body>
          Journals and unsent drafts are not shared with the other demo role.
          Managing family contacts does not give a parent journal access.
        </Body>
      </Paper>
      <Body>
        This prototype has no login or encryption. Anyone using the demo
        selector can choose either fictional account. Use fictional information
        only.
      </Body>
      <Heading>Someone else can listen.</Heading>
      <Body>
        If a parent is the person you are worried about, you can choose another
        trusted adult, such as a teacher, relative, school counselor, or coach.
        You do not need a parent’s permission to seek safety information or
        emergency help.
      </Body>
      <Button
        label="Prepare words for another trusted adult"
        primary
        onPress={() =>
          compose(
            "I would like to talk with you privately. Can we find a time?",
            "",
            true,
          )
        }
      />
      <Body>
        If there is immediate danger, contact local emergency services or reach
        a safe adult nearby.
      </Body>
      <Body muted>
        Blocking disables that demo connection. Reports are simulated and do not
        reach a safety team. Between Us is a communication tool, not a therapist
        or emergency service.
      </Body>
    </View>
  );
}
export function OnboardingScreen() {
  const { switchRole, go } = useApp();
  const { theme: t } = useAppearance();
  return (
    <View style={{ gap: 28, paddingTop: 20 }}>
      <Image
        source={require("../../assets/brand/symbol.png")}
        accessibilityLabel="Approved Between Us symbol"
        style={{
          width: 90,
          height: 90,
          resizeMode: "contain",
          backgroundColor: t.logoSurface,
          borderRadius: 10,
        }}
      />
      <Eyebrow>BETWEEN US</Eyebrow>
      <Heading large>A place to find{"\n"}your words.</Heading>
      <Body>when it&apos;s hard to find the words, start here</Body>
      <Divider />
      <Body>
        Write for yourself. Start a conversation. Choose what you share.
      </Body>
      <Body muted>
        This is a fictional demo. Nothing is delivered, and writing disappears
        when you reload. Your device appearance is the only preference saved.
      </Body>
      <Button
        label="Explore as Sam"
        primary
        onPress={() => switchRole("child")}
      />
      <Button label="Explore as Alex" onPress={() => switchRole("parent")} />
      <Button quiet label="Privacy & safety" onPress={() => go("Safety")} />
      <Eyebrow>{BUILD_ID}</Eyebrow>
    </View>
  );
}
