import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { reflection, type Reflection } from "../communication";
import { hasUnsavedWriting, isSavedEntry } from "../journal";
import type { Entry } from "../model";
import { useApp } from "../state";
import { useAppearance } from "../appearance";
import { Body, Button, Divider, Eyebrow, Heading, Icon, Paper } from "../ui";

export function JournalOverview() {
  const app = useApp();
  const { theme } = useAppearance();
  const entries = app.journals[app.role];
  const dirty = hasUnsavedWriting(app.journalDraft, entries);

  function openEntry(entry: Entry) {
    if (entry.id && entry.id === app.journalDraft.id) {
      app.go("JournalEditor");
      return;
    }
    const open = () => {
      app.setJournalDraft({ ...entry });
      app.go("JournalEditor");
    };
    if (dirty) {
      app.confirm(
        "Replace your unsaved writing?",
        "Your current draft has not been saved. You can keep writing or replace it with this entry.",
        open,
      );
    } else open();
  }

  return (
    <View style={styles.page}>
      <Eyebrow>A SPACE OF YOUR OWN</Eyebrow>
      <Heading large>My Journal</Heading>
      <View style={styles.private}>
        <Icon name="lock" size={16} />
        <Body muted style={{ flexShrink: 1 }}>
          Private to your demo role
        </Body>
      </View>
      <Body muted>
        Write what you want to keep for yourself. Nothing here becomes a
        message.
      </Body>
      <Button
        label="New entry"
        primary
        onPress={() => openEntry({ id: "", title: "", body: "" })}
      />
      {dirty && (
        <Button
          label="Continue unsaved writing"
          quiet
          onPress={() => app.go("JournalEditor")}
        />
      )}
      <View style={styles.recent}>
        <Eyebrow>YOUR PAGES</Eyebrow>
        {!entries.length && (
          <Body muted>
            No entries yet. Your first page can be a few words or a longer
            letter to yourself.
          </Body>
        )}
        {entries.map((entry) => (
          <View key={entry.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Revisit ${entry.title || "Untitled entry"}`}
              onPress={() => openEntry(entry)}
              style={({ pressed }) => [
                styles.entry,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <View style={styles.entryCopy}>
                <Text style={[styles.entryTitle, { color: theme.text }]}>
                  {entry.title || "Untitled entry"}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.preview, { color: theme.muted }]}
                >
                  {entry.body}
                </Text>
                <Text style={[styles.savedLabel, { color: theme.muted }]}>
                  {entry.id.endsWith("example")
                    ? "Fictional example"
                    : "Saved in this session"}
                </Text>
              </View>
              <Icon name="arrow" size={20} />
            </Pressable>
            <Divider />
          </View>
        ))}
      </View>
      <Body muted>
        Demo entries stay in memory and disappear on reload. This is not secure
        account storage.
      </Body>
    </View>
  );
}

export function JournalEditor() {
  const app = useApp();
  const { theme } = useAppearance();
  const [suggestion, setSuggestion] = useState<Reflection>();
  const draft = app.journalDraft;
  const saved = isSavedEntry(draft, app.journals[app.role]);

  function change(field: "title" | "body", value: string) {
    app.setJournalDraft((old) => ({ ...old, [field]: value }));
    setSuggestion(undefined);
  }

  function remove() {
    app.confirm(
      "Delete this entry?",
      "This removes the saved entry from this session. You cannot undo this deletion.",
      () => {
        app.deleteJournal(draft.id);
        app.go("Journal");
      },
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.private}>
        <Icon name="lock" size={16} />
        <Body muted>Just for you · nothing is shared</Body>
      </View>
      <Paper>
        <View style={styles.writing}>
          <Text style={[styles.inputLabel, { color: theme.muted }]}>
            ENTRY TITLE
          </Text>
          <TextInput
            accessibilityLabel="Entry title"
            value={draft.title}
            onChangeText={(value) => change("title", value)}
            placeholder="Give this page a title"
            placeholderTextColor={theme.muted}
            maxLength={150}
            autoComplete="off"
            importantForAutofill="no"
            underlineColorAndroid="transparent"
            style={[
              styles.titleInput,
              { color: theme.text, borderColor: theme.border },
            ]}
          />
          <Text style={[styles.inputLabel, { color: theme.muted }]}>
            YOUR PRIVATE DEMO WORDS
          </Text>
          <TextInput
            accessibilityLabel="Your private demo words"
            value={draft.body}
            onChangeText={(value) => change("body", value)}
            placeholder="There is no right way to begin…"
            placeholderTextColor={theme.muted}
            multiline
            maxLength={5000}
            autoComplete="off"
            importantForAutofill="no"
            underlineColorAndroid="transparent"
            textAlignVertical="top"
            style={[styles.bodyInput, { color: theme.text }]}
          />
        </View>
      </Paper>
      <Button
        label={saved ? "Saved in this session" : "Save entry"}
        primary
        disabled={saved || !draft.body.trim()}
        onPress={app.saveJournal}
      />
      <Body muted>
        {saved
          ? "Your entry stays here. Sharing always starts with separate words."
          : "Your unsaved writing stays here while you visit another tab. Reloading clears this demo."}
      </Body>
      {saved && (
        <Button
          label="Help me find someone to talk to"
          quiet
          onPress={() => setSuggestion(reflection(draft.body))}
        />
      )}
      {suggestion && saved && (
        <View style={[styles.reflection, { borderColor: theme.border }]}>
          <Eyebrow>A CONVERSATION, IF YOU WANT ONE</Eyebrow>
          <Heading>You choose the person.</Heading>
          <Body>{suggestion.suggestion}</Body>
          <Button
            label="Prepare separate words"
            primary
            onPress={() => app.compose(suggestion.starter, "")}
          />
          <Button
            label="Prepare for an in-person talk"
            quiet
            onPress={() => app.compose(suggestion.starter, undefined, true)}
          />
          <Button
            label="Dismiss suggestion"
            quiet
            onPress={() => setSuggestion(undefined)}
          />
        </View>
      )}
      {!!draft.id && (
        <Button
          label={`Delete ${draft.title || "entry"}`}
          quiet
          onPress={remove}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  private: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  recent: { gap: 10, marginTop: 12 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 19,
    minHeight: 80,
  },
  entryCopy: { flex: 1, gap: 7 },
  entryTitle: { fontSize: 20, fontWeight: "600", lineHeight: 28 },
  preview: { fontSize: 16, lineHeight: 24 },
  savedLabel: { fontSize: 12, lineHeight: 18 },
  writing: { gap: 10 },
  inputLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1.2 },
  titleInput: {
    fontSize: 22,
    lineHeight: 30,
    paddingVertical: 10,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  bodyInput: {
    fontSize: 18,
    lineHeight: 29,
    minHeight: 220,
    paddingVertical: 8,
  },
  reflection: { gap: 14, borderTopWidth: 1, paddingTop: 22, marginTop: 8 },
});
