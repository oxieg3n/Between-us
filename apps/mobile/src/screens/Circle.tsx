import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppearance } from "../appearance";
import { canManage, canMessage, type Contact } from "../communication";
import { newId } from "../model";
import { useApp } from "../state";
import { Body, Button, Divider, Eyebrow, Field, Heading, Icon } from "../ui";

function initials(name: string) {
  return name
    .split(" - ")[0]
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function CircleScreen() {
  const app = useApp();
  const { theme: t } = useAppearance();
  const administrator = canManage(app.role);
  const [adding, setAdding] = useState(false);
  const [focusedPerson, setFocusedPerson] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Trusted adult");
  const people = app.contacts.filter(
    (person) => person.id !== (app.role === "child" ? "sam" : "alex"),
  );

  function addContact() {
    if (!name.trim() || !category.trim()) return;
    const person: Contact = {
      id: newId(),
      name: name.trim(),
      category: category.trim(),
      status: administrator ? "approved" : "requested",
      accepted: false,
      verified: false,
    };
    app.setContacts((old) => [...old, person]);
    setName("");
    setAdding(false);
    app.setNotice(
      administrator
        ? "Trusted person added directly. Acceptance and verification are still required before messaging."
        : "Request added for the demo parent to review. No invitation was sent.",
    );
  }

  return (
    <View style={styles.page}>
      <Eyebrow>PEOPLE YOU CHOOSE</Eyebrow>
      <Heading large>My Circle</Heading>
      <Body muted>
        Good conversations begin with someone you feel safe with.
      </Body>
      {administrator && (
        <Body muted>
          You manage trusted people directly. Your role does not give you access
          to anyone else’s journal.
        </Body>
      )}
      <Button
        label={administrator ? "Add trusted person" : "Request trusted person"}
        primary
        onPress={() => setAdding(true)}
      />
      {adding && (
        <View style={[styles.form, { borderColor: t.border }]}>
          <Heading>
            {administrator ? "Someone you trust" : "Who would you like to add?"}
          </Heading>
          <Field
            label="Fictional contact name"
            value={name}
            onChangeText={setName}
          />
          <Field
            label="Relationship or category"
            value={category}
            onChangeText={setCategory}
          />
          <Body muted>
            {administrator
              ? "Adding is your decision. It does not verify their identity or authorize messaging."
              : "Your demo parent can review this request. You can still prepare words to say in person."}
          </Body>
          <Button
            label={
              administrator ? "Add person to circle" : "Submit contact request"
            }
            primary
            disabled={!name.trim() || !category.trim()}
            onPress={addContact}
          />
          <Button
            label="Cancel contact form"
            quiet
            onPress={() => {
              setAdding(false);
              setName("");
            }}
          />
        </View>
      )}
      <View style={{ gap: 4 }}>
        <Eyebrow>
          {administrator ? "TRUSTED PEOPLE & REQUESTS" : "YOUR PEOPLE"}
        </Eyebrow>
        {!people.length && (
          <Body muted>
            Your circle is empty. Request a person you already know and trust,
            or prepare words for an in-person conversation.
          </Body>
        )}
        {people.map((person) => (
          <View key={person.id}>
            <Pressable
              accessibilityRole="button"
              onFocus={() => setFocusedPerson(person.id)}
              onBlur={() => setFocusedPerson("")}
              accessibilityLabel={`Open ${person.name}, ${person.category}, ${person.status}`}
              onPress={() => {
                app.setSelectedContact(person.id);
                app.go("Contact");
              }}
              style={({ pressed }) => [
                styles.person,
                {
                  opacity: pressed ? 0.65 : 1,
                  borderColor:
                    focusedPerson === person.id ? t.primary : "transparent",
                },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: t.soft }]}>
                <Text
                  style={{ color: t.text, fontSize: 17, fontWeight: "600" }}
                >
                  {initials(person.name)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={{ color: t.text, fontSize: 17, fontWeight: "600" }}
                >
                  {person.name}
                </Text>
                <Text style={{ color: t.muted, fontSize: 14, lineHeight: 21 }}>
                  {person.category} · {person.status}
                </Text>
              </View>
              <Icon name="arrow" size={18} color={t.muted} />
            </Pressable>
            <Divider />
          </View>
        ))}
      </View>
      <Body muted>
        Fictional people and connection checks. Approval, acceptance and
        verification are separate steps.
      </Body>
      <Button
        label="Prepare an in-person conversation"
        quiet
        onPress={() => app.compose("", undefined, true)}
      />
      <Button label="Privacy & safety" quiet onPress={() => app.go("Safety")} />
    </View>
  );
}

export function ContactScreen() {
  const app = useApp();
  const { theme: t } = useAppearance();
  const person = app.contacts.find(
    (contact) =>
      contact.id === app.selectedContact &&
      contact.id !== (app.role === "child" ? "sam" : "alex"),
  );
  if (!person)
    return (
      <View style={styles.page}>
        <Heading>Person unavailable</Heading>
        <Body muted>This person is not available in your demo circle.</Body>
        <Button label="Return to My Circle" onPress={() => app.go("Circle")} />
      </View>
    );
  const administrator = canManage(app.role);
  const eligible = canMessage(person);

  return (
    <View style={styles.page}>
      <Eyebrow>
        {administrator ? "PARENT CONTACT MANAGEMENT" : "IN YOUR CIRCLE"}
      </Eyebrow>
      <View style={styles.identity}>
        <View
          style={[
            styles.avatar,
            styles.largeAvatar,
            { backgroundColor: t.soft },
          ]}
        >
          <Text style={{ color: t.text, fontSize: 24 }}>
            {initials(person.name)}
          </Text>
        </View>
        <Heading large>{person.name}</Heading>
      </View>
      <Body muted>{person.category}</Body>
      <Divider />
      <View style={{ gap: 10 }}>
        <Eyebrow>CONNECTION</Eyebrow>
        <Body>{person.status[0].toUpperCase() + person.status.slice(1)}</Body>
        <Body muted>
          {eligible
            ? "Acceptance and identity checks are represented by fictional demo fixtures. This is not real verification."
            : "Messaging is unavailable for this connection. You can choose another person or prepare words to say in person. Approval, acceptance and identity checks are separate."}
        </Body>
      </View>
      {eligible && (
        <Button
          label={`Talk to ${person.name.split(" - ")[0]}`}
          primary
          onPress={() => app.openConversation(person.id)}
        />
      )}
      <Button
        label="Prepare words to say in person"
        quiet
        onPress={() => app.compose("", person.id, true)}
      />
      {administrator && person.status === "requested" && (
        <Button
          label={`Approve ${person.name}`}
          primary
          onPress={() => app.changeContact(person.id, "approved")}
        />
      )}
      <Divider />
      <Eyebrow>YOUR CHOICES</Eyebrow>
      {person.status !== "blocked" && person.status !== "removed" && (
        <Button
          label={`Block ${person.name}`}
          onPress={() =>
            app.confirm(
              "Block this connection?",
              "This immediately disables messaging in this demo session. No notification is sent.",
              () => app.changeContact(person.id, "blocked"),
            )
          }
        />
      )}
      <Button
        label={`Report ${person.name}`}
        quiet
        onPress={() =>
          app.setNotice(
            "Demo report noted only on this screen. Nothing was submitted to a safety team. Open Privacy & safety for ways to seek human help.",
          )
        }
      />
      {administrator && person.status !== "removed" && (
        <Button
          label={`Remove ${person.name}`}
          onPress={() =>
            app.confirm(
              "Remove this trusted person?",
              "This removes their messaging permission in the demo. A new connection would require acceptance and verification again.",
              () => app.changeContact(person.id, "removed"),
            )
          }
        />
      )}
      <Button label="Privacy & safety" quiet onPress={() => app.go("Safety")} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 22 },
  form: {
    gap: 18,
    paddingVertical: 22,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  person: {
    borderWidth: 2,
    minHeight: 86,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  largeAvatar: { width: 64, height: 64, borderRadius: 20 },
  identity: { gap: 18, alignItems: "flex-start" },
});
