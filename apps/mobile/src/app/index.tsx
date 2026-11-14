import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  canManage,
  canMessage,
  reflection,
  type Contact,
  type Role,
} from "../communication";
import {
  newId,
  createMessage,
  initialJournals,
  seedContacts,
  updateContact,
  type Checkin,
  type Entry,
  type Message,
} from "../model";
import { Button } from "../ui";
import { light, dark } from "../theme";
type Screen =
  | "Home"
  | "Journal"
  | "Circle"
  | "Write"
  | "Review"
  | "Messages"
  | "Check-ins"
  | "Safety";
const responses = [
  "Just listen",
  "Give me ideas",
  "Talk later",
  "Talk in person",
];
function setScreen(screen: Screen) {
  router.setParams({ screen });
}
export default function App() {
  const { screen: screenParam } = useLocalSearchParams<{ screen?: string }>();
  const screens: Screen[] = [
    "Home",
    "Journal",
    "Circle",
    "Write",
    "Review",
    "Messages",
    "Check-ins",
    "Safety",
  ];
  const screen: Screen = screens.includes(screenParam as Screen)
    ? (screenParam as Screen)
    : "Home";
  const systemDark = useColorScheme() === "dark";
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">(
    "system",
  );
  const t = (appearance === "system" ? systemDark : appearance === "dark")
    ? dark
    : light;
  const [role, setRole] = useState<Role>("child");
  const [journals, setJournals] = useState(initialJournals),
    [contacts, setContacts] = useState(seedContacts);
  const [entry, setEntry] = useState<Entry>({ id: "", title: "", body: "" }),
    [suggestion, setSuggestion] = useState("");
  const [draft, setDraft] = useState(""),
    [recipient, setRecipient] = useState("alex"),
    [response, setResponse] = useState(responses[0]),
    [inPerson, setInPerson] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]),
    [contactName, setContactName] = useState(""),
    [category, setCategory] = useState("Trusted adult");
  const [notice, setNotice] = useState(""),
    [question, setQuestion] = useState("What made you smile today?"),
    [schedule, setSchedule] = useState("Fridays at 17:00");
  const [checkins, setCheckins] = useState<Checkin[]>([
    {
      id: "example",
      prompt: "What is one thing you would like to do together?",
      schedule: "Example Friday at 17:00",
      status: "open",
    },
  ]);
  const [deleteId, setDeleteId] = useState("");
  const mine = contacts.filter(
    (c) => c.id !== (role === "child" ? "sam" : "alex"),
  );
  function go(next: Screen) {
    setNotice("");
    setDeleteId("");
    setScreen(next);
  }
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "Home") return false;
      setScreen(screen === "Review" ? "Write" : "Home");
      return true;
    });
    return () => sub.remove();
  }, [screen]);
  function switchRole(next: Role) {
    if (next === role) return;
    setRole(next);
    setScreen("Home");
    setEntry({ id: "", title: "", body: "" });
    setDraft("");
    setSuggestion("");
    setNotice("");
    setDeleteId("");
    setContactName("");
    setRecipient(next === "child" ? "alex" : "sam");
    setInPerson(false);
  }
  function compose(value = "") {
    setDraft(value);
    setInPerson(false);
    go("Write");
  }
  function changeContact(
    id: string,
    status: "approved" | "removed" | "blocked",
  ) {
    setContacts((old) => updateContact(role, old, id, status));
    setNotice(
      `Contact ${status} in this demo. No invitation or verification was sent.`,
    );
  }
  const button = (
    label: string,
    action: () => void,
    primary = false,
    disabled = false,
  ) => (
    <Button
      key={label}
      label={label}
      onPress={action}
      primary={primary}
      disabled={disabled}
      theme={t}
    />
  );
  const text = (value: string, big = false) => (
    <Text style={[big ? s.title : s.body, { color: t.text }]}>{value}</Text>
  );
  const field = (
    label: string,
    value: string,
    change: (v: string) => void,
    multiline = false,
  ) => (
    <View style={s.field}>
      <Text style={[s.label, { color: t.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        multiline={multiline}
        maxLength={multiline ? 5000 : 150}
        placeholder={multiline ? "Use fictional words for this demo…" : ""}
        placeholderTextColor={t.muted}
        style={[
          s.input,
          multiline && s.multiline,
          { backgroundColor: t.surface, color: t.text, borderColor: t.border },
        ]}
      />
    </View>
  );
  const card = (children: React.ReactNode, accent = false) => (
    <View
      style={[
        s.card,
        {
          backgroundColor: accent ? t.accent : t.surface,
          borderColor: t.border,
        },
      ]}
    >
      {children}
    </View>
  );
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.background }]}>
      <StatusBar style={t === dark ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
        >
          <View style={s.brand}>
            <Image
              source={require("../../assets/brand/symbol.png")}
              style={s.logo}
              accessibilityLabel="Between Us: two people sharing a conversation"
            />
            <View style={s.brandCopy}>
              {text("Between Us", true)}
              <Text style={{ color: t.muted, fontSize: 13 }}>
                when it&apos;s hard to find the words, start here
              </Text>
            </View>
          </View>
          <Text style={[s.demo, { color: t.muted }]}>
            FICTIONAL DEMO · memory only · resets on reload
          </Text>
          <View style={s.row}>
            {button(role === "child" ? "● Kid / teen" : "Kid / teen", () =>
              switchRole("child"),
            )}
            {button(role === "parent" ? "● Parent" : "Parent", () =>
              switchRole("parent"),
            )}
          </View>
          <View style={s.row}>
            {(
              ["Home", "Journal", "Circle", "Messages", "Check-ins"] as Screen[]
            ).map((item) =>
              button(screen === item ? `● ${item}` : item, () => go(item)),
            )}
          </View>
          {screen !== "Home" &&
            text(
              (
                {
                  Write: "Start a conversation",
                  Review: "Your words, your choice",
                  Journal: "My Journal",
                  Circle: "My Circle",
                  "Check-ins": "Open the Door",
                } as Partial<Record<Screen, string>>
              )[screen] || screen,
              true,
            )}
          {!!notice && (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[s.notice, { color: t.text, backgroundColor: t.accent }]}
            >
              {notice}
            </Text>
          )}
          {screen === "Home" && (
            <>
              {text(
                role === "child"
                  ? "A small start\ncan open a door."
                  : "Make room for\na little conversation.",
                true,
              )}
              {text(
                role === "child"
                  ? "You choose the words, the person, and when you are ready."
                  : "Start with a question. Leave space for an answer, whenever they are ready.",
              )}
              {button("Start a conversation", () => compose(), true)}
              {card(
                <>
                  {text("Just for you", true)}
                  {text(
                    "A quiet place to write. Nothing in your journal is copied into a message.",
                  )}
                  {button("Open My Journal", () => go("Journal"))}
                </>,
              )}
              {card(
                <>
                  {text("Little Conversations", true)}
                  {text(
                    "If we could make up a new family tradition, what would it be?",
                  )}
                  {button("Try this conversation", () =>
                    compose(
                      "If we could make up a new family tradition, what would it be?",
                    ),
                  )}
                </>,
                true,
              )}
              {role === "parent" &&
                button("Manage trusted people", () => go("Circle"))}
            </>
          )}
          {screen === "Journal" && (
            <>
              {text(
                "Only your demo role sees these entries. Switching roles clears the editor. This shared-device prototype has no secure account separation.",
              )}
              {journals[role].map((e) => (
                <View key={e.id}>
                  {card(
                    <>
                      {text(e.title || "Untitled", true)}
                      {button(`Revisit ${e.title || "entry"}`, () => {
                        setEntry({ ...e });
                        setSuggestion("");
                        setDeleteId("");
                      })}
                      {button(`Delete ${e.title || "entry"}`, () =>
                        setDeleteId(e.id),
                      )}
                      {deleteId === e.id && (
                        <>
                          {text("Delete this entry from this session?")}
                          {button("Confirm delete", () => {
                            setJournals((old) => ({
                              ...old,
                              [role]: old[role].filter(
                                (item) => item.id !== e.id,
                              ),
                            }));
                            if (entry.id === e.id)
                              setEntry({ id: "", title: "", body: "" });
                            setSuggestion("");
                            setDeleteId("");
                          })}
                          {button("Keep entry", () => setDeleteId(""))}
                        </>
                      )}
                    </>,
                  )}
                </View>
              ))}
              {button("New entry", () => {
                setEntry({ id: "", title: "", body: "" });
                setSuggestion("");
              })}
              {field("Entry title", entry.title, (title) =>
                setEntry((old) => ({ ...old, title })),
              )}
              {field(
                "Your private demo words",
                entry.body,
                (body) => {
                  setEntry((old) => ({ ...old, body }));
                  setSuggestion("");
                },
                true,
              )}
              {button(
                "Save entry in memory",
                () => {
                  const saved = { ...entry, id: entry.id || `${newId()}` };
                  setJournals((old) => ({
                    ...old,
                    [role]: [
                      ...old[role].filter((e) => e.id !== saved.id),
                      saved,
                    ],
                  }));
                  setEntry(saved);
                  setNotice("Saved only in this session. Nothing was shared.");
                },
                true,
                !entry.body.trim(),
              )}
              {button(
                "Help me find someone to talk to",
                () => setSuggestion(reflection(entry.body).suggestion),
                false,
                !entry.body.trim(),
              )}
              {!!suggestion &&
                card(
                  <>
                    {text(suggestion)}
                    {button("Prepare separate words", () =>
                      compose("Can we talk?"),
                    )}
                    {button("Dismiss suggestion", () => setSuggestion(""))}
                  </>,
                )}
            </>
          )}
          {screen === "Circle" && (
            <>
              {text(
                "All people and connection checks here are fictional. Adding or approving a person does not enable messaging.",
              )}
              {mine.map((c) => (
                <View key={c.id}>
                  {card(
                    <>
                      {text(c.name, true)}
                      {text(
                        `${c.category} · ${c.status}${canMessage(c) ? " (simulated checks)" : ""}`,
                      )}
                      {canMessage(c) &&
                        button(`Write to ${c.name}`, () => {
                          setRecipient(c.id);
                          compose();
                        })}
                      {c.status !== "blocked" &&
                        c.status !== "removed" &&
                        button(`Block ${c.name}`, () =>
                          changeContact(c.id, "blocked"),
                        )}
                      {button(`Report ${c.name}`, () =>
                        setNotice(
                          "Demo report noted only here. No report was sent. Open Privacy & safety for human help options.",
                        ),
                      )}
                      {canManage(role) &&
                        c.status !== "removed" &&
                        button(`Remove ${c.name}`, () =>
                          changeContact(c.id, "removed"),
                        )}
                      {canManage(role) &&
                        c.status === "requested" &&
                        button(`Approve ${c.name}`, () =>
                          changeContact(c.id, "approved"),
                        )}
                    </>,
                  )}
                </View>
              ))}
              {field("Fictional contact name", contactName, setContactName)}
              {field("Relationship or category", category, setCategory)}
              {button(
                role === "parent"
                  ? "Add trusted person"
                  : "Request trusted person",
                () => {
                  if (!contactName.trim()) return;
                  const c: Contact = {
                    id: `${newId()}`,
                    name: contactName.trim(),
                    category: category.trim() || "Trusted person",
                    status: canManage(role) ? "approved" : "requested",
                    accepted: false,
                    verified: false,
                  };
                  setContacts((old) => [...old, c]);
                  setContactName("");
                  setNotice(
                    role === "parent"
                      ? "Added directly. Acceptance and verification are still required; messaging stays disabled."
                      : "Request added for the demo parent. No real invitation was sent.",
                  );
                },
                true,
                !contactName.trim(),
              )}
            </>
          )}
          {screen === "Write" && (
            <>
              {text(
                "You can simply ask, “Can we talk?” Review every message before simulating a send.",
              )}
              {button(
                inPerson
                  ? "Switch to demo message"
                  : "Prepare for an in-person talk",
                () => setInPerson(!inPerson),
              )}
              {inPerson ? (
                text(
                  "Choose someone you feel safe with. They do not need the app. These words stay here.",
                )
              ) : (
                <>
                  {text("Choose a simulated connection:")}
                  {mine
                    .filter(canMessage)
                    .map((c) =>
                      button(`${recipient === c.id ? "● " : ""}${c.name}`, () =>
                        setRecipient(c.id),
                      ),
                    )}
                  {!mine.some(canMessage) &&
                    text(
                      "No permitted connections. You can still prepare words in person.",
                    )}
                </>
              )}
              {field("Your message", draft, setDraft, true)}
              {button("Use “Can we talk?”", () => setDraft("Can we talk?"))}
              {role === "parent" && (
                <View style={s.row}>
                  {button("An apology starter", () =>
                    setDraft(
                      "I would like to apologize. Can we find a time to talk?",
                    ),
                  )}
                  {button("Family changes starter", () =>
                    setDraft(
                      "There is a family change I would like to talk about. When would be a good time?",
                    ),
                  )}
                </View>
              )}
              {text("What kind of response would help?")}
              <View style={s.row}>
                {responses.map((r) =>
                  button(`${response === r ? "● " : ""}${r}`, () =>
                    setResponse(r),
                  ),
                )}
              </View>
              {button(
                "Review my words",
                () => go("Review"),
                true,
                !draft.trim() ||
                  (!inPerson &&
                    !mine.some((c) => c.id === recipient && canMessage(c))),
              )}
            </>
          )}
          {screen === "Review" && (
            <>
              {card(
                <>
                  {text(
                    inPerson
                      ? "For an in-person conversation"
                      : `To: ${contacts.find((c) => c.id === recipient)?.name || "Unavailable person"}`,
                    true,
                  )}
                  {text(draft)}
                  {text(`Response wanted: ${response}`)}
                </>,
              )}
              {text(
                "Only these words are included. Your journal and other drafts are never attached.",
              )}
              {button("Edit my words", () => go("Write"))}
              {button(
                inPerson
                  ? "Keep words here for practice"
                  : "Simulate sending this message",
                () => {
                  if (inPerson) {
                    setNotice(
                      "Ready to practice. Nothing was sent or stored outside this session.",
                    );
                    return;
                  }
                  const m = createMessage(
                    role,
                    contacts.find((c) => c.id === recipient),
                    draft,
                    response,
                  );
                  if (!m) {
                    setNotice(
                      "This connection cannot receive messages. Return to My Circle.",
                    );
                    return;
                  }
                  setMessages((old) => [...old, m]);
                  setDraft("");
                  go("Messages");
                  setNotice("Simulated only. No message was delivered.");
                },
                true,
              )}
            </>
          )}
          {screen === "Messages" && (
            <>
              {text(
                "Simulated conversation history. No network delivery or automatic replies.",
              )}
              {messages
                .filter(
                  (m) =>
                    m.author === role ||
                    m.recipient === (role === "child" ? "sam" : "alex"),
                )
                .map((m) => (
                  <View key={m.id}>
                    {card(
                      <>
                        {text(
                          `${m.author === role ? "You" : "Demo family member"} → ${contacts.find((c) => c.id === m.recipient)?.name || "Removed contact"}`,
                        )}
                        {text(m.text)}
                        {text(m.response)}
                        {m.author !== role &&
                          button("Help me reply", () => {
                            setRecipient(role === "child" ? "alex" : "sam");
                            compose(
                              "Thank you for telling me. Would you like me to listen, or find a time to talk?",
                            );
                          })}
                      </>,
                    )}
                  </View>
                ))}
              {!messages.length &&
                text("Your first small hello can start here.")}
              {button("Start a conversation", () => compose(), true)}
              {button("Conversation Do-Over", () =>
                compose(
                  "Could we start again? I would like to try saying that differently.",
                ),
              )}
            </>
          )}
          {screen === "Check-ins" && (
            <>
              {text(
                "Invitations, never obligations. Schedules and notifications are simulated. No reminders, scores, or penalties.",
              )}
              {checkins
                .filter((c) => role === "parent" || c.status === "open")
                .map((c) => (
                  <View key={c.id}>
                    {card(
                      <>
                        {text(c.prompt, true)}
                        {text(`${c.schedule} · simulated`)}
                        {role === "child" ? (
                          <>
                            {button("Answer / write more", () => {
                              setRecipient("alex");
                              compose();
                            })}
                            {button("Can we talk?", () => {
                              setRecipient("alex");
                              compose("Can we talk?");
                            })}
                            {button("A small good thing happened", () => {
                              setRecipient("alex");
                              compose(
                                "A small good thing happened today. Can I tell you about it?",
                              );
                            })}
                            {button("Answer later", () => {
                              setCheckins((old) =>
                                old.map((item) =>
                                  item.id === c.id
                                    ? { ...item, status: "later" }
                                    : item,
                                ),
                              );
                              setNotice("Set aside. No reminder will be sent.");
                            })}
                            {button("Skip this check-in", () => {
                              setCheckins((old) =>
                                old.map((item) =>
                                  item.id === c.id
                                    ? { ...item, status: "skipped" }
                                    : item,
                                ),
                              );
                              setNotice("Skipped. You do not owe an answer.");
                            })}
                          </>
                        ) : (
                          button("Answer this prompt myself", () =>
                            compose(c.prompt),
                          )
                        )}
                      </>,
                    )}
                  </View>
                ))}
              {role === "child" &&
                checkins.some((c) => c.status === "later") &&
                button("Show invitations I set aside", () =>
                  setCheckins((old) =>
                    old.map((c) =>
                      c.status === "later" ? { ...c, status: "open" } : c,
                    ),
                  ),
                )}
              {role === "parent" && (
                <>
                  {field("Check-in question", question, setQuestion)}
                  {field("Example recurring schedule", schedule, setSchedule)}
                  {text(
                    `Preview for Sam: ${question} · ${schedule} · Reply, later, or skip.`,
                  )}
                  {button(
                    "Create simulated check-in",
                    () => {
                      if (!canManage(role)) return;
                      setCheckins((old) => [
                        ...old,
                        {
                          id: `${newId()}`,
                          prompt: question.trim(),
                          schedule: schedule.trim(),
                          status: "open",
                        },
                      ]);
                      setNotice(
                        "Example check-in added. No notification was scheduled.",
                      );
                    },
                    true,
                    !question.trim() || !schedule.trim(),
                  )}
                </>
              )}
            </>
          )}
          {screen === "Safety" && (
            <>
              {card(
                <>
                  {text("Your words belong to you", true)}
                  {text(
                    "Journals and unsent drafts are not shared with the other demo role. Parents manage contacts; that does not give them journal access. This prototype has no login or encryption. Use fictional information only.",
                  )}
                </>,
              )}
              {text(
                "If someone makes you feel unsafe, you can speak with another trusted adult, such as a teacher, school counselor, relative, or coach. You do not need a parent’s permission to seek safety information or emergency help.",
              )}
              {text(
                "If a parent is the person you are worried about, you can choose a different trusted adult. If there is immediate danger, contact local emergency services or reach a safe adult nearby.",
              )}
              {text(
                "Blocking disables that demo connection. Reporting here is simulated and does not reach a safety team. Between Us is a communication tool, not a therapist or emergency service.",
              )}
              {button(
                "Prepare words for another trusted adult",
                () => {
                  compose(
                    "I would like to talk with you privately. Can we find a time?",
                  );
                  setInPerson(true);
                },
                true,
              )}
              {text("Appearance")}
              <View style={s.row}>
                {(["system", "light", "dark"] as const).map((a) =>
                  button(`${appearance === a ? "● " : ""}${a}`, () =>
                    setAppearance(a),
                  ),
                )}
              </View>
            </>
          )}
          <View style={s.footer}>
            {button("Privacy & safety", () => go("Safety"))}
            <Text style={{ color: t.muted, fontSize: 12 }}>
              Powered By Oxieg3n · Nothing is sent to a server
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: 22,
    paddingBottom: 48,
    gap: 16,
    maxWidth: 650,
    width: "100%",
    alignSelf: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 14 },
  brandCopy: { flex: 1, gap: 4 },
  logo: { width: 68, height: 68, resizeMode: "contain" },
  title: { fontSize: 29, fontWeight: "700", lineHeight: 36 },
  body: { fontSize: 17, lineHeight: 26 },
  demo: { fontSize: 11, letterSpacing: 0.7 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 17,
    paddingVertical: 13,
    justifyContent: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  card: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 14 },
  field: { gap: 8 },
  label: { fontSize: 15, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    fontSize: 17,
    minHeight: 50,
  },
  multiline: { minHeight: 150, textAlignVertical: "top" },
  notice: { padding: 16, borderRadius: 16, fontSize: 16, lineHeight: 24 },
  footer: { marginTop: 24, gap: 16 },
});
