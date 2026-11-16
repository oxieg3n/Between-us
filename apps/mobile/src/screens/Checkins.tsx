import { useState } from "react";
import { Text, View } from "react-native";
import { useApp } from "../state";
import { useAppearance } from "../appearance";
import { newId, type Checkin } from "../model";
import { Body, Button, Divider, Eyebrow, Field, Heading, Paper } from "../ui";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const littleConversations = [
  "What made you smile today?",
  "If we could invent a family tradition, what would it be?",
  "What is something you would like to learn together?",
];
export function CheckinsScreen() {
  const {
    role,
    checkins,
    setCheckins,
    compose,
    go,
    setScheduleId,
    setNotice,
    confirm,
    removeSchedule,
  } = useApp();
  const { theme: t } = useAppearance();
  const visible = checkins.filter(
    (c) => role === "parent" || c.status === "open",
  );
  return (
    <View style={{ gap: 22 }}>
      <Heading>An open door.{"\n"}No need to rush.</Heading>
      <Body muted>
        Reply, come back later, or skip. These invitations have no scores or
        penalties.
      </Body>
      <Eyebrow>SIMULATED CHECK-INS</Eyebrow>
      {visible.map((c) => (
        <View
          key={c.id}
          style={{
            gap: 16,
            borderBottomWidth: 1,
            borderColor: t.border,
            paddingBottom: 24,
          }}
        >
          <Body>{c.prompt}</Body>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            {c.schedule} · {role === "parent" ? "To Sam · " : ""}simulated
          </Text>
          {role === "parent" ? (
            <>
              <Button
                label="Edit schedule"
                onPress={() => {
                  setScheduleId(c.id);
                  go("Scheduler");
                }}
              />
              <Button
                quiet
                label="Remove schedule"
                onPress={() =>
                  confirm(
                    "Remove this schedule?",
                    "This removes the fictional invitation from this session.",
                    () => removeSchedule(c.id),
                  )
                }
              />
              <Button
                quiet
                label="Answer this prompt myself"
                onPress={() => compose(c.prompt)}
              />
            </>
          ) : (
            <>
              <Button
                label="Write my response"
                primary
                onPress={() => compose("", "alex")}
              />
              <Button
                label="Can we talk?"
                onPress={() => compose("Can we talk?", "alex")}
              />
              <Button
                quiet
                label="A small good thing happened"
                onPress={() =>
                  compose(
                    "A small good thing happened today. Can I tell you about it?",
                    "alex",
                  )
                }
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    quiet
                    label="Answer later"
                    onPress={() => {
                      setCheckins((old) =>
                        old.map((x) =>
                          x.id === c.id ? { ...x, status: "later" } : x,
                        ),
                      );
                      setNotice("Set aside. No reminder will be sent.");
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    quiet
                    label="Skip this check-in"
                    onPress={() => {
                      setCheckins((old) =>
                        old.map((x) =>
                          x.id === c.id ? { ...x, status: "skipped" } : x,
                        ),
                      );
                      setNotice("Skipped. You do not owe an answer.");
                    }}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      ))}
      {!visible.length && (
        <Body>
          You have no new check-ins. There is nothing you need to catch up on.
        </Body>
      )}
      {role === "parent" && (
        <Button
          label="New check-in schedule"
          primary
          onPress={() => {
            setScheduleId("");
            go("Scheduler");
          }}
        />
      )}
      {role === "child" && checkins.some((c) => c.status === "later") && (
        <Button
          label="Show invitations I set aside"
          onPress={() =>
            setCheckins((old) =>
              old.map((c) =>
                c.status === "later" ? { ...c, status: "open" } : c,
              ),
            )
          }
        />
      )}
      <Divider />
      <Eyebrow>LITTLE CONVERSATIONS</Eyebrow>
      {littleConversations.map((p) => (
        <View key={p} style={{ gap: 8 }}>
          <Body>{p}</Body>
          <Button quiet label={`Try: ${p}`} onPress={() => compose(p)} />
        </View>
      ))}
    </View>
  );
}
export function SchedulerScreen() {
  const { role, checkins, scheduleId, saveSchedule, contacts } = useApp();
  const existing = checkins.find((c) => c.id === scheduleId);
  const [question, setQuestion] = useState(
    existing?.prompt || "What made you smile today?",
  );
  const [selected, setSelected] = useState(existing?.days || ["Fri"]);
  const [time, setTime] = useState(existing?.time || "17:00");
  const [recipient, setRecipient] = useState(existing?.recipient || "sam");
  const { theme: t } = useAppearance();

  if (role !== "parent")
    return (
      <Body>
        Only the parent demo account can manage schedules. You can always skip a
        check-in.
      </Body>
    );
  const valid =
    contacts.some(
      (c) =>
        c.id === recipient &&
        c.id === "sam" &&
        !c.messagingBlocked && c.status !== "blocked" &&
        c.status !== "removed",
    ) &&
    question.trim().length > 0 &&
    selected.length > 0 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  function save() {
    if (!valid) return;
    const item: Checkin = {
      id: existing?.id || newId(),
      prompt: question.trim(),
      days: selected,
      time,
      recipient,
      schedule: `${selected.join(", ")} at ${time}`,
      status: existing?.status || "open",
    };
    saveSchedule(item);
  }
  return (
    <View style={{ gap: 22 }}>
      <Heading>A question,{"\n"}not an obligation.</Heading>
      <Body muted>
        Set up an example invitation. Schedules and notifications are simulated.
      </Body>
      <Eyebrow>TO</Eyebrow>
      {contacts
        .filter(
          (c) =>
            c.id === "sam" && !c.messagingBlocked && c.status !== "removed" && c.status !== "blocked",
        )
        .map((c) => (
          <Button
            key={c.id}
            label={c.name}
            selected={recipient === c.id}
            onPress={() => setRecipient(c.id)}
          />
        ))}
      <Field
        label="Check-in question"
        value={question}
        onChangeText={setQuestion}
        multiline
      />
      <Eyebrow>REPEAT ON</Eyebrow>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {days.map((d) => (
          <Button
            key={d}
            label={d}
            selected={selected.includes(d)}
            onPress={() =>
              setSelected((old) =>
                old.includes(d) ? old.filter((x) => x !== d) : [...old, d],
              )
            }
          />
        ))}
      </View>
      <Field label="Time (24-hour HH:MM)" value={time} onChangeText={setTime} />
      {!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) && (
        <Text style={{ color: t.danger }}>Use a time such as 17:00.</Text>
      )}
      <Paper>
        <Eyebrow>PREVIEW FOR SAM</Eyebrow>
        <Body>{question || "Your question will appear here."}</Body>
        <Body muted>
          {selected.join(", ") || "Choose a day"} at {time} · simulated
        </Body>
        <Body muted>Write a response · Answer later · Skip</Body>
      </Paper>
      <Button
        label="Save example schedule"
        primary
        disabled={!valid}
        onPress={save}
      />
    </View>
  );
}
