import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { getLocalModelAdapter } from "../local-model";
import { hasUnsavedWriting, isSavedEntry } from "../journal";
import {
  createLatestOnlyRunner,
  generateConversation,
  type SuggestionResult,
  type SuggestionVariant,
} from "../journal-intelligence";
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
  const { scale } = useWindowDimensions();
  const runner = useMemo(() => createLatestOnlyRunner(), []);
  const [presentation, setPresentation] = useState<{
    key: string;
    result: SuggestionResult;
  }>();
  const [workingKey, setWorkingKey] = useState<string>();
  const [showVariants, setShowVariants] = useState(false);
  const draft = app.journalDraft;
  const saved = isSavedEntry(draft, app.journals[app.role]);
  const enabled = app.conversationIdeas[app.role];
  const request = useMemo(
    () => ({ text: draft.body, role: app.role, contacts: app.contacts }),
    [draft.body, app.role, app.contacts],
  );
  const contextKey = JSON.stringify([
    app.role,
    draft.id,
    draft.title,
    draft.body,
    app.contacts,
  ]);
  const result = presentation?.key === contextKey ? presentation.result : undefined;

  const findWords = useCallback(
    (variant?: SuggestionVariant, delay = 0) => {
      runner.run(
        async (signal) => {
          setWorkingKey(contextKey);
          return generateConversation({ ...request, variant }, getLocalModelAdapter(), signal);
        },
        (next) => {
          setWorkingKey(undefined);
          if (next) setPresentation({ key: contextKey, result: next });
        },
        delay,
      );
    },
    [contextKey, request, runner],
  );

  useEffect(() => {
    if (enabled && request.text.trim().length >= 12) {
      findWords(undefined, 1200);
    }
    return runner.cancel;
  }, [enabled, findWords, request.text, runner]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") {
        runner.cancel();
        setWorkingKey(undefined);
        setPresentation(undefined);
      }
    });
    return () => subscription.remove();
  }, [runner]);

  function dismiss() {
    runner.cancel();
    setWorkingKey(undefined);
    setPresentation(undefined);
    setShowVariants(false);
  }

  function change(field: "title" | "body", value: string) {
    dismiss();
    app.setJournalDraft((old) => ({ ...old, [field]: value }));
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
        <Body key={scale} muted style={{ flexShrink: 1 }}>Just for you · nothing is shared</Body>
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
            autoCorrect={false}
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
            autoCorrect={false}
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
      <View style={[styles.reflection, { borderColor: theme.border }]}>
        <Eyebrow>WORDS TO SHARE, ONLY IF YOU WANT</Eyebrow>
        <Body muted>
          Optional starters use this page on your device. Nothing is sent or
          shared. Your writing stays yours.
        </Body>
        <Button
          label="Conversation Ideas While I Write"
          selected={enabled}
          onPress={() => {
            dismiss();
            app.setConversationIdeas((old) => ({
              ...old,
              [app.role]: !enabled,
            }));
          }}
        />
        <Body muted>
          {enabled
            ? "On for this demo role. Ideas appear after a pause; you can turn them off anytime."
            : "Off. You can ask for a starter whenever you want."}
        </Body>
        <Button
          label="Find words to share"
          quiet
          onPress={() => findWords()}
        />
      </View>
      {saved && (
        <Button
          label="Help me find someone to talk to"
          quiet
          onPress={() => findWords()}
        />
      )}
      {workingKey === contextKey && (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>
          Finding words on this device…
        </Text>
      )}
      {result && (
        <View style={[styles.reflection, { borderColor: theme.border }]}>
          <Eyebrow>A CONVERSATION, IF YOU WANT ONE</Eyebrow>
          <Heading>You choose the person.</Heading>
          {!!result.suggestions[0] && <Body muted>{result.suggestions[0].why}</Body>}
          <Body muted>{result.label}</Body>
          {!!result.fallbackReason && <Body muted>{result.fallbackReason}</Body>}
          {!!result.safetyNotice && (
            <View style={{ gap: 8 }}>
              <Body>{result.safetyNotice}</Body>
              <Button
                label="Privacy & safety information"
                quiet
                onPress={() => app.go("Safety")}
              />
            </View>
          )}
          {result.suggestions.slice(0, 2).map((suggestion, index) => (
            <View key={suggestion.id} style={{ gap: 12 }}>
              {index > 0 && <Divider />}
              <Body style={{ fontWeight: "600" }}>{suggestion.title}</Body>
              <Body>{suggestion.draft}</Body>
              <Button
                label={index === 0 ? "Prepare separate words" : "Choose someone for this starter"}
                primary={index === 0}
                quiet={index > 0}
                onPress={() => app.compose(suggestion.draft, "", false, result)}
              />
              {index === 0 && (
                <Button
                  label="Prepare for an in-person talk"
                  quiet
                  onPress={() => app.compose(suggestion.draft, "", true, result)}
                />
              )}
            </View>
          ))}
          {result.suggestions.length > 0 && (
            <View style={{ gap: 8 }}>
              <Button
                label={showVariants ? "Hide wording choices" : "Adjust the wording"}
                quiet
                onPress={() => setShowVariants(!showVariants)}
              />
              {showVariants && ([
                ["shorter", "Shorter"],
                ["simpler", "Simpler"],
                ["direct", "More direct"],
                ["like-me", "More like me"],
                ["another", "Another way"],
              ] as const).map(([variant, label]) => (
                <Button key={variant} label={label} quiet onPress={() => findWords(variant)} />
              ))}
            </View>
          )}
          <Button
            label="Dismiss suggestion"
            quiet
            onPress={dismiss}
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
