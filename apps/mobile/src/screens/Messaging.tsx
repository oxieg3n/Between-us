import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { canMessage } from "../communication";
import { useAppearance } from "../appearance";
import {
  messageDay,
  messageTime,
  personId,
  threadFor,
} from "../messaging-logic";
import { useApp } from "../state";
import { Body, Button, Divider, Eyebrow, Field, Heading, Icon } from "../ui";

const responses = [
  "Just listen",
  "Give me ideas",
  "Talk later",
  "Talk in person",
];
const firstName = (name: string) => name.split(" - ")[0];

function FocusPressable({
  style,
  ...props
}: Omit<PressableProps, "style"> & {
  style: (state: {
    pressed: boolean;
    focused: boolean;
  }) => StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => style({ pressed, focused })}
    />
  );
}

export function ChatsList() {
  const app = useApp();
  const { theme: t } = useAppearance();
  const threads = app.contacts
    .filter((contact) => contact.id !== personId(app.role))
    .map((contact) => ({
      contact,
      messages: threadFor(app.messages, app.role, contact.id),
    }))
    .filter((thread) => thread.messages.length > 0)
    .sort(
      (a, b) =>
        (b.messages.at(-1)?.createdAt || 0) -
        (a.messages.at(-1)?.createdAt || 0),
    );
  return (
    <View style={styles.section}>
      <Eyebrow>A little closer</Eyebrow>
      <Heading large>Conversations</Heading>
      <Body muted>A few words can be a beginning.</Body>
      <Button label="New conversation" primary onPress={() => app.compose()} />
      {threads.length === 0 && (
        <View style={styles.empty}>
          <Heading>Your first hello belongs here.</Heading>
          <Body muted>
            Choose someone in your circle. You can start with just “Can we
            talk?”
          </Body>
        </View>
      )}
      {threads.map(({ contact, messages }) => {
        const latest = messages[messages.length - 1];
        return (
          <View key={contact.id}>
            <FocusPressable
              accessibilityRole="button"
              accessibilityLabel={`Open conversation with ${firstName(contact.name)}. ${latest.text}`}
              onPress={() => app.openConversation(contact.id)}
              style={({ pressed, focused }) => [
                styles.thread,
                {
                  backgroundColor: pressed ? t.soft : "transparent",
                  borderColor: focused ? t.primary : "transparent",
                },
              ]}
            >
              <View style={[styles.initial, { backgroundColor: t.soft }]}>
                <Text style={[styles.initialText, { color: t.primary }]}>
                  {contact.name.slice(0, 1)}
                </Text>
              </View>
              <View style={styles.threadCopy}>
                <View style={styles.threadLine}>
                  <Text style={[styles.person, { color: t.text }]}>
                    {firstName(contact.name)}
                  </Text>
                  <Text style={[styles.meta, { color: t.muted }]}>
                    {messageTime(latest.createdAt)}
                  </Text>
                </View>
                <Text
                  numberOfLines={2}
                  style={[styles.preview, { color: t.muted }]}
                >
                  {latest.author === app.role ? "You: " : ""}
                  {latest.text}
                </Text>
              </View>
              <Icon name="arrow" size={18} color={t.muted} />
            </FocusPressable>
            <Divider />
          </View>
        );
      })}
      <View style={styles.smallNote}>
        <Body muted>Fictional conversations. Nothing here is delivered.</Body>
      </View>
      <Button
        label="Open the Door check-ins"
        quiet
        onPress={() => app.go("Checkins")}
      />
    </View>
  );
}

export function ConversationDetail() {
  const app = useApp();
  const { theme: t } = useAppearance();
  const [helpers, setHelpers] = useState(false);
  const contact = app.contacts.find(
    (person) => person.id === app.activeContact,
  );
  const messages = threadFor(app.messages, app.role, app.activeContact);
  if (!contact)
    return (
      <View style={styles.section}>
        <Heading>This conversation is unavailable.</Heading>
        <Body>The person is no longer in this demo circle.</Body>
        <Button label="Return to chats" onPress={() => app.go("Chats")} />
      </View>
    );
  return (
    <View style={styles.section}>
      <View style={styles.conversationIdentity}>
        <View style={[styles.initial, { backgroundColor: t.soft }]}>
          <Text style={[styles.initialText, { color: t.primary }]}>
            {contact.name.slice(0, 1)}
          </Text>
        </View>
        <View style={styles.threadCopy}>
          <Text style={[styles.person, { color: t.text }]}>
            {firstName(contact.name)}
          </Text>
          <Text style={[styles.meta, { color: t.muted }]}>
            {contact.category} · fictional connection
          </Text>
        </View>
      </View>
      <Divider />
      <Text style={[styles.simulation, { color: t.muted }]}>
        Demo thread · no real delivery
      </Text>
      {messages.length === 0 && (
        <View style={styles.empty}>
          <Heading>A place to begin.</Heading>
          <Body muted>There is no need to explain everything at once.</Body>
        </View>
      )}
      {messages.map((message, index) => {
        const mine = message.author === app.role;
        const previous = messages[index - 1];
        const next = messages[index + 1];
        const newDay =
          !previous ||
          messageDay(previous.createdAt) !== messageDay(message.createdAt);
        const endsGroup =
          !next ||
          next.author !== message.author ||
          messageDay(next.createdAt) !== messageDay(message.createdAt);
        return (
          <View key={message.id} style={styles.messageGroup}>
            {newDay && (
              <Text style={[styles.day, { color: t.muted }]}>
                {messageDay(message.createdAt)}
              </Text>
            )}
            <View
              style={[
                styles.message,
                {
                  alignSelf: mine ? "flex-end" : "flex-start",
                  backgroundColor: mine ? t.outgoing : t.incoming,
                  borderColor: mine ? t.outgoing : t.border,
                  borderBottomRightRadius: mine ? 4 : 16,
                  borderBottomLeftRadius: mine ? 16 : 4,
                  marginTop:
                    previous?.author === message.author && !newDay ? 0 : 8,
                },
              ]}
            >
              <Text
                selectable
                style={[
                  styles.messageText,
                  { color: mine ? t.onOutgoing : t.text },
                ]}
              >
                {message.text}
              </Text>
              {!!message.response && (
                <Text
                  style={[
                    styles.request,
                    { color: mine ? t.onOutgoing : t.muted },
                  ]}
                >
                  {message.response}
                </Text>
              )}
            </View>
            {endsGroup && (
              <Text
                style={[
                  styles.messageMeta,
                  { color: t.muted, textAlign: mine ? "right" : "left" },
                ]}
              >
                {mine ? "You" : firstName(contact.name)} ·{" "}
                {messageTime(message.createdAt)} · simulated
              </Text>
            )}
          </View>
        );
      })}
      {!canMessage(contact) && (
        <Body muted>
          This connection cannot receive messages. You can still prepare words
          for an in-person conversation.
        </Body>
      )}
      <Button
        label={helpers ? "Hide writing helpers" : "Writing helpers"}
        quiet
        onPress={() => setHelpers(!helpers)}
      />
      {helpers && (
        <View style={styles.helpers}>
          <Body muted>Use a starting point, then make it yours.</Body>
          <Button
            label="Help Me Reply"
            onPress={() =>
              app.compose(
                "Thank you for telling me. Would you like me to listen, or find a time to talk?",
                contact.id,
              )
            }
          />
          <Button
            label="Conversation Do-Over"
            quiet
            onPress={() =>
              app.compose(
                "Could we start again? I would like to try saying that differently.",
                contact.id,
              )
            }
          />
        </View>
      )}
    </View>
  );
}

/** Master shell places this outside its thread ScrollView, above the keyboard. */
export function ConversationComposer() {
  const app = useApp();
  const { theme: t } = useAppearance();
  const [focused, setFocused] = useState(false);
  const contact = app.contacts.find(
    (person) => person.id === app.activeContact,
  );
  const permitted = !!contact && app.recipientAllowed(contact) && canMessage(contact);
  return (
    <View
      style={[
        styles.composer,
        { backgroundColor: t.background, borderTopColor: t.border },
      ]}
    >
      <Text
        accessibilityElementsHidden
        style={[styles.composerHint, { color: t.muted }]}
      >
        Your draft stays here until you review it.
      </Text>
      <View style={styles.composerRow}>
        <TextInput
          accessibilityLabel="Message draft"
          testID="conversation-message-input"
          value={app.messageDraft}
          onChangeText={app.setMessageDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          maxLength={5000}
          placeholder={
            permitted ? "Write a message…" : "Connection unavailable"
          }
          placeholderTextColor={t.muted}
          editable={permitted}
          underlineColorAndroid="transparent"
          style={[
            styles.composerInput,
            {
              color: t.text,
              backgroundColor: t.surface,
              borderColor: focused ? t.primary : t.border,
              borderWidth: focused ? 2 : 1,
            },
          ]}
        />
        <Button
          label="Review"
          primary
          disabled={!permitted || !app.messageDraft.trim()}
          onPress={() => {
            app.setRecipient(app.activeContact);
            app.setInPerson(false);
            app.go("Review");
          }}
        />
      </View>
    </View>
  );
}

export function ComposeScreen() {
  const app = useApp();
  const { theme: t } = useAppearance();
  const [helpers, setHelpers] = useState(false);
  const [showNeeds, setShowNeeds] = useState(false);
  const people = app.contacts.filter(
    (person) => person.id !== personId(app.role) && app.recipientAllowed(person) && canMessage(person),
  );
  const permitted = people.some((person) => person.id === app.recipient);
  return (
    <View style={styles.section}>
      <Eyebrow>One small beginning</Eyebrow>
      <Heading large>Find your words.</Heading>
      <Body muted>As much or as little as you want to say.</Body>
      <View style={styles.modeChoice}>
        <Button
          label={
            app.inPerson ? "Message in the app" : "In-app message selected"
          }
          quiet
          onPress={() => app.setInPerson(false)}
        />
        <Button
          label={
            app.inPerson
              ? "In-person words selected"
              : "Prepare for an in-person talk"
          }
          quiet
          onPress={() => app.setInPerson(true)}
        />
      </View>
      {app.inPerson ? (
        <Body muted>
          Choose someone you feel safe with. They do not need Between Us; these
          words stay with you.
        </Body>
      ) : (
        <View style={styles.recipientSection}>
          <Eyebrow>To</Eyebrow>
          {people.length === 0 && (
            <Body muted>
              No permitted connections yet. You can still prepare words for an
              in-person talk.
            </Body>
          )}
          {people.map((person) => (
            <FocusPressable
              key={person.id}
              accessibilityRole="radio"
              accessibilityLabel={firstName(person.name)}
              accessibilityState={{ checked: app.recipient === person.id }}
              aria-checked={app.recipient === person.id}
              onPress={() => app.setRecipient(person.id)}
              style={({ pressed, focused }) => [
                styles.recipient,
                {
                  borderColor: focused ? t.primary : t.border,
                  backgroundColor: pressed ? t.soft : "transparent",
                },
              ]}
            >
              <Text style={[styles.person, { color: t.text }]}>
                {firstName(person.name)}
              </Text>
              <Text style={{ color: t.primary, fontSize: 16 }}>
                {app.recipient === person.id ? "Selected" : "Choose"}
              </Text>
            </FocusPressable>
          ))}
        </View>
      )}
      <Field
        label="Your message"
        value={app.messageDraft}
        onChangeText={app.setMessageDraft}
        multiline
        placeholder="Can we talk?"
      />
      <Button
        label="Can We Talk?"
        quiet
        onPress={() => app.setMessageDraft("Can we talk?")}
      />
      <Button
        label={helpers ? "Hide word starters" : "Help Me Find the Words"}
        quiet
        onPress={() => setHelpers(!helpers)}
      />
      {helpers && (
        <View style={styles.helpers}>
          <Body muted>A starting point, ready for your own words.</Body>
          <Button
            label="I would like you to listen"
            onPress={() =>
              app.setMessageDraft(
                "There is something I would like to share. Could you listen for a little while?",
              )
            }
          />
          {app.role === "parent" && (
            <>
              <Button
                label="An apology"
                quiet
                onPress={() =>
                  app.setMessageDraft(
                    "I would like to apologize. Can we find a time to talk?",
                  )
                }
              />
              <Button
                label="A family change"
                quiet
                onPress={() =>
                  app.setMessageDraft(
                    "There is a family change I would like to talk about. When would be a good time?",
                  )
                }
              />
            </>
          )}
        </View>
      )}
      <Divider />
      <Button
        label={
          showNeeds
            ? "Hide response preferences"
            : `What I Need From You · ${app.response}`
        }
        quiet
        onPress={() => setShowNeeds(!showNeeds)}
      />
      {showNeeds && (
        <View style={styles.responseList}>
          <Body muted>
            You can ask for the kind of response that would help.
          </Body>
          {responses.map((response) => (
            <FocusPressable
              key={response}
              accessibilityRole="radio"
              accessibilityLabel={response}
              accessibilityState={{ checked: app.response === response }}
              aria-checked={app.response === response}
              onPress={() => app.setResponse(response)}
              style={({ focused }) => [
                styles.response,
                { borderColor: focused ? t.primary : t.border },
              ]}
            >
              <Text style={{ color: t.text, fontSize: 16 }}>{response}</Text>
              <Text style={{ color: t.primary, fontSize: 16 }}>
                {app.response === response ? "Selected" : "Choose"}
              </Text>
            </FocusPressable>
          ))}
        </View>
      )}
      <Button
        label="Review my words"
        primary
        disabled={!app.messageDraft.trim() || (!app.inPerson && !permitted)}
        onPress={() => app.go("Review")}
      />
      <Body muted>
        Your journal is never attached. In-app sends are simulated.
      </Body>
    </View>
  );
}

export function ReviewScreen() {
  const app = useApp();
  const { theme: t } = useAppearance();
  const person = app.contacts.find((contact) => contact.id === app.recipient);
  const permitted =
    !!person && app.recipientAllowed(person) && person.id !== personId(app.role) && canMessage(person);
  return (
    <View style={styles.section}>
      <Eyebrow>Before you share</Eyebrow>
      <Heading large>Your words.{"\n"}Your choice.</Heading>
      <View
        style={[
          styles.reviewLetter,
          { borderColor: t.border, backgroundColor: t.paper },
        ]}
      >
        <Eyebrow>
          {app.inPerson
            ? "For an in-person conversation"
            : `To ${person ? firstName(person.name) : "an unavailable person"}`}
        </Eyebrow>
        <Text selectable style={[styles.reviewText, { color: t.text }]}>
          {app.messageDraft || "No message has been written yet."}
        </Text>
        <Divider />
        <Body muted>{app.response}</Body>
      </View>
      <Body muted>
        Only these words are included. No journal entries or other drafts are
        attached.
      </Body>
      {!app.inPerson && !permitted && (
        <Body>
          This connection is unavailable. Return to your words to choose another
          person or prepare an in-person conversation.
        </Body>
      )}
      <Button
        label={app.inPerson ? "Keep words for practice" : "Simulate send"}
        primary
        disabled={!app.messageDraft.trim() || (!app.inPerson && !permitted)}
        onPress={app.sendMessage}
      />
      <Button label="Edit my words" quiet onPress={() => app.go("Compose")} />
      <Body muted>
        {app.inPerson
          ? "Nothing is sent. These practice words stay in this session."
          : "This is a fictional demo. No message will be delivered."}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 18 },
  empty: { paddingVertical: 28, gap: 12 },
  thread: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 20,
    paddingHorizontal: 2,
    borderWidth: 2,
    borderRadius: 8,
    minHeight: 86,
  },
  initial: {
    height: 44,
    width: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  initialText: { fontSize: 20, fontWeight: "600" },
  threadCopy: { flex: 1, gap: 5 },
  threadLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 6,
  },
  person: { fontSize: 18, fontWeight: "600", flexShrink: 1 },
  preview: { fontSize: 16, lineHeight: 24 },
  meta: { fontSize: 12, lineHeight: 18 },
  smallNote: { marginTop: 12 },
  conversationIdentity: { flexDirection: "row", alignItems: "center", gap: 12 },
  simulation: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  day: { fontSize: 12, textAlign: "center", paddingVertical: 12 },
  messageGroup: { gap: 5 },
  message: {
    maxWidth: "88%",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 17,
    paddingVertical: 13,
    gap: 9,
  },
  messageText: { fontSize: 17, lineHeight: 25 },
  request: { fontSize: 12, lineHeight: 18 },
  messageMeta: { fontSize: 11, lineHeight: 17, paddingHorizontal: 4 },
  helpers: { gap: 10, paddingBottom: 8 },
  composer: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 20,
    gap: 8,
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
  composerHint: { fontSize: 11, lineHeight: 17 },
  composerRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  composerInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    maxHeight: 130,
    fontSize: 17,
    lineHeight: 24,
    textAlignVertical: "top",
  },
  modeChoice: { gap: 4 },
  recipientSection: { gap: 8 },
  recipient: {
    borderBottomWidth: 1,
    borderWidth: 2,
    borderRadius: 6,
    minHeight: 56,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    gap: 8,
  },
  responseList: { gap: 4 },
  response: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    minHeight: 48,
  },
  reviewLetter: { borderWidth: 1, borderRadius: 6, padding: 24, gap: 24 },
  reviewText: { fontSize: 20, lineHeight: 31 },
});
