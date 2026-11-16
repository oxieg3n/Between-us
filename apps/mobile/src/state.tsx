import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BackHandler } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  blockForAuthor,
  canExchange,
  canManage,
  contactsForAuthor,
  emptyAuthorBlocks,
  type Role,
  type Contact,
} from "./communication";
import {
  isRecipientAllowed,
  type SuggestionResult,
} from "./journal-intelligence";
import {
  createMessage,
  initialJournals,
  newId,
  seedContacts,
  updateContact,
  type Checkin,
  type Entry,
  type Message,
} from "./model";
export type Screen =
  | "Home"
  | "Journal"
  | "JournalEditor"
  | "Chats"
  | "Conversation"
  | "Compose"
  | "Review"
  | "Circle"
  | "Contact"
  | "Checkins"
  | "Scheduler"
  | "Settings"
  | "LocalModel"
  | "Safety"
  | "Finance"
  | "Chores"
  | "Budget"
  | "Goals"
  | "GoalDetail"
  | "Matching"
  | "Payouts"
  | "FinanceHistory"
  | "Onboarding";
const screens: Screen[] = [
  "Home",
  "Journal",
  "JournalEditor",
  "Chats",
  "Conversation",
  "Compose",
  "Review",
  "Circle",
  "Contact",
  "Checkins",
  "Scheduler",
  "Settings",
  "LocalModel",
  "Safety",
  "Finance",
  "Chores",
  "Budget",
  "Goals",
  "GoalDetail",
  "Matching",
  "Payouts",
  "FinanceHistory",
  "Onboarding",
];
export const emptyEntry = (): Entry => ({ id: "", title: "", body: "" });
const seedMessages: Message[] = [
  {
    id: "hello",
    author: "parent",
    recipient: "sam",
    text: "Would you like to choose something for us to cook this weekend?",
    response: "Just listen",
    createdAt: Date.now() - 3600000,
  },
  {
    id: "reply",
    author: "child",
    recipient: "alex",
    text: "Yes! Can we try making pizza?",
    response: "Just listen",
    createdAt: Date.now() - 3500000,
  },
];
function useStateModel() {
  const { screen: param } = useLocalSearchParams<{ screen?: string }>();
  const screen = screens.includes(param as Screen)
    ? (param as Screen)
    : "Onboarding";
  const [role, setRole] = useState<Role>("child");
  const [journals, setJournals] = useState(initialJournals);
  const [journalDraft, setJournalDraft] = useState<Entry>(emptyEntry);
  const [contactRecords, setContacts] = useState(seedContacts);
  const [blocks, setBlocks] = useState(emptyAuthorBlocks);
  const blocksRef = useRef(blocks);
  const contacts = useMemo(
    () => contactsForAuthor(contactRecords, role, blocks),
    [contactRecords, role, blocks],
  );
  const [messages, setMessages] = useState(seedMessages);
  const [messageDraft, setMessageDraft] = useState("");
  const [recipient, setRecipient] = useState("alex");
  const [activeContact, setActiveContact] = useState("alex");
  const [response, setResponse] = useState("Just listen");
  const [inPerson, setInPerson] = useState(false);
  const [conversationIdeas, setConversationIdeas] = useState<
    Record<Role, boolean>
  >({ child: false, parent: false });
  const [recipientRestrictions, setRecipientRestrictions] = useState<
    Pick<SuggestionResult, "excludedContactIds" | "excludedCategories">
  >({ excludedContactIds: [], excludedCategories: [] });
  const recipientAllowed = (contact: Contact) =>
    isRecipientAllowed(contact, recipientRestrictions);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<{
    title: string;
    body: string;
    action: () => void;
  } | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([
    {
      id: "example",
      prompt: "What is one thing you would like to do together?",
      schedule: "Fridays at 17:00",
      status: "open",
      days: ["Fri"],
      time: "17:00",
      recipient: "sam",
    },
  ]);
  const [scheduleId, setScheduleId] = useState("");
  const [selectedContact, setSelectedContact] = useState("alex");
  const history = useRef<Screen[]>([]);
  const confirm = (title: string, body: string, action: () => void) =>
    setDialog({ title, body, action });
  const go = useCallback(
    (next: Screen) => {
      history.current.push(screen);
      setNotice("");
      router.setParams({ screen: next });
    },
    [screen],
  );
  const tab = useCallback((next: Screen) => {
    history.current = [];
    setNotice("");
    router.setParams({ screen: next });
  }, []);
  const back = useCallback(() => {
    setNotice("");
    router.setParams({ screen: history.current.pop() || "Home" });
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dialog) {
        setDialog(null);
        return true;
      }
      if (screen === "Home" || screen === "Onboarding") return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [screen, back, dialog]);
  function switchRole(next: Role) {
    if (next === role) {
      tab("Home");
      return;
    }
    const perform = () => {
      setRole(next);
      setJournalDraft(emptyEntry());
      setMessageDraft("");
      setRecipient(next === "child" ? "alex" : "sam");
      setActiveContact(next === "child" ? "alex" : "sam");
      setResponse("Just listen");
      setInPerson(false);
      setRecipientRestrictions({
        excludedContactIds: [],
        excludedCategories: [],
      });
      setDialog(null);
      tab("Home");
    };
    const saved = journals[role].find((e) => e.id === journalDraft.id);
    const dirty =
      (journalDraft.body || journalDraft.title) &&
      (!saved ||
        saved.body !== journalDraft.body ||
        saved.title !== journalDraft.title);
    if (dirty || messageDraft.trim())
      confirm(
        "Switch demo account?",
        "Unsent writing will be cleared. Saved journal entries stay in memory for their author.",
        perform,
      );
    else perform();
  }
  function compose(
    value = "",
    person = role === "child" ? "alex" : "sam",
    offline = false,
    exclusions: Pick<
      SuggestionResult,
      "excludedContactIds" | "excludedCategories"
    > = { excludedContactIds: [], excludedCategories: [] },
  ) {
    const perform = () => {
      setMessageDraft(value);
      setRecipient(person);
      setActiveContact(person);
      setInPerson(offline);
      setRecipientRestrictions(exclusions);
      go("Compose");
    };
    if (messageDraft.trim() && messageDraft !== value)
      confirm(
        "Replace unsent words?",
        "Your current message has not been sent. Replace it with a new beginning?",
        perform,
      );
    else perform();
  }
  function openConversation(id: string) {
    const perform = () => {
      if (
        contacts.some((c) => c.id === id && !recipientAllowed(c)) &&
        messageDraft.trim()
      ) {
        setNotice("Choose another person for these prepared words.");
        return;
      }
      if (activeContact !== id) setMessageDraft("");
      setActiveContact(id);
      setRecipient(id);
      go("Conversation");
    };
    if (activeContact !== id && messageDraft.trim())
      confirm(
        "Change conversation?",
        "Unsent words for the previous person will be cleared.",
        perform,
      );
    else perform();
  }
  function saveJournal() {
    if (!journalDraft.body.trim()) {
      setNotice("Add a few words before saving.");
      return;
    }
    const saved = { ...journalDraft, id: journalDraft.id || newId() };
    setJournals((old) => ({
      ...old,
      [role]: [saved, ...old[role].filter((e) => e.id !== saved.id)],
    }));
    setJournalDraft(saved);
    setNotice("Saved in memory. Only your demo journal was updated.");
  }
  function deleteJournal(id: string) {
    setJournals((old) => ({
      ...old,
      [role]: old[role].filter((e) => e.id !== id),
    }));
    if (journalDraft.id === id) setJournalDraft(emptyEntry());
    setNotice("Entry deleted from this session.");
  }
  function sendMessage() {
    if (inPerson) {
      setNotice("Your words are ready to practice. Nothing was sent.");
      return;
    }
    const contact = contacts.find(
      (c) =>
        c.id === recipient &&
        recipientAllowed(c) &&
        c.id !== (role === "child" ? "sam" : "alex"),
    );
    const message = createMessage(
      role,
      contact,
      messageDraft,
      response,
      blocksRef.current,
    );
    if (!message) {
      setNotice(
        "Message not sent. Choose an accepted, verified demo connection and add your words.",
      );
      return;
    }
    setMessages((old) => [...old, message]);
    setActiveContact(recipient);
    setMessageDraft("");
    setRecipientRestrictions({
      excludedContactIds: [],
      excludedCategories: [],
    });
    go("Conversation");
    setNotice("Simulated message only. Nothing was delivered.");
  }
  function changeContact(
    id: string,
    status: "approved" | "removed" | "blocked",
  ) {
    if (
      !contactRecords.some((c) => c.id === id) ||
      id === (role === "child" ? "sam" : "alex")
    ) return;
    if (status === "blocked") {
      const next = blockForAuthor(blocksRef.current, role, id);
      blocksRef.current = next;
      setBlocks(next);
    } else {
      if (!canManage(role)) return;
      setContacts((old) => updateContact(role, old, id, status));
    }
    setNotice(
      status === "blocked"
        ? "Blocked in this session. Messaging is disabled."
        : `Contact ${status}. Acceptance and verification are separate.`,
    );
  }
  function saveSchedule(item: Checkin) {
    if (
      !canManage(role) ||
      !contacts.some(
        (c) =>
          c.id === item.recipient &&
          c.id === "sam" &&
          canExchange(role, c, blocksRef.current),
      )
    ) {
      setNotice("Choose an available family member before saving.");
      return;
    }
    setCheckins((old) => [...old.filter((c) => c.id !== item.id), item]);
    setScheduleId(item.id);
    setNotice("Example schedule saved. Notifications are simulated.");
  }
  function removeSchedule(id: string) {
    if (!canManage(role)) return;
    setCheckins((old) => old.filter((c) => c.id !== id));
    setNotice("Example schedule removed.");
  }
  return {
    screen,
    go,
    tab,
    back,
    role,
    switchRole,
    journals,
    setJournals,
    journalDraft,
    setJournalDraft,
    saveJournal,
    deleteJournal,
    contacts,
    setContacts,
    messages,
    setMessages,
    messageDraft,
    setMessageDraft,
    recipient,
    setRecipient,
    activeContact,
    setActiveContact,
    response,
    setResponse,
    inPerson,
    conversationIdeas,
    setConversationIdeas,
    recipientAllowed,
    setInPerson,
    compose,
    openConversation,
    sendMessage,
    notice,
    setNotice,
    dialog,
    setDialog,
    confirm,
    checkins,
    setCheckins,
    scheduleId,
    setScheduleId,
    selectedContact,
    setSelectedContact,
    changeContact,
    saveSchedule,
    removeSchedule,
  };
}
const Context = createContext<ReturnType<typeof useStateModel> | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const value = useStateModel();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider missing");
  return value;
}
