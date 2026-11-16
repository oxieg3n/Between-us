import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Body, Button, Divider, Eyebrow, Heading } from "../ui";
import { useApp } from "../state";
import {
  LOCAL_MODEL,
  downloadAndLoadModel,
  getLocalModelStatus,
  loadDownloadedModel,
  unloadLocalModel,
} from "../local-model";

export function LocalModelScreen() {
  const app = useApp();
  const [status, setStatus] = useState(getLocalModelStatus);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  const operationVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pending.current) void unloadLocalModel().catch(() => undefined);
    };
  }, []);
  async function perform(work: () => Promise<void>) {
    const operation = ++operationVersion.current;
    pending.current = true;
    setBusy(true);
    try {
      await work();
    } catch {
      if (mounted.current && operation === operationVersion.current)
        app.setNotice(
          "The optional model could not finish setup. Local conversation starters are still available. Check build support, storage and connection before retrying.",
        );
    } finally {
      if (operation === operationVersion.current) {
        pending.current = false;
        if (mounted.current) {
          setStatus(getLocalModelStatus());
          setBusy(false);
        }
      }
    }
  }
  return (
    <View style={{ gap: 22 }}>
      <Eyebrow>OPTIONAL · NO CLOUD INFERENCE</Eyebrow>
      <Heading large>Words, on this device.</Heading>
      <Body>
        Get editable conversation starters on this device. You choose the
        person, then edit and review before sharing.
      </Body>
      <Body>{status.message}</Body>
      {status.available && <Body>Optional download: 369 MiB. Keep at least 1 GiB of storage free. Only model files are saved; your writing stays in memory.</Body>}
      {(status.ready || !status.available) && <Button label="Write in My Journal" primary onPress={() => app.go("Journal")} />}
      {busy && (
        <Body>
          Setting up the optional model… You can cancel or leave this screen.
          Keep using fictional information.
        </Body>
      )}
      {status.available && <><Button
        label="Download & load optional model"
        primary={!status.ready}
        disabled={!status.available || busy}
        onPress={() =>
          app.confirm(
            "Download the optional model?",
            "Download the pinned 369 MiB Apache-2.0 model from its public Hugging Face source, verify its SHA-256, then load it on this device? Journal text is never sent. Model files remain until the app’s data is removed.",
            () => void perform(downloadAndLoadModel),
          )
        }
      />
      <Button
        label="Load downloaded model"
        disabled={!status.available || busy}
        onPress={() => void perform(loadDownloadedModel)}
      />
      <Button
        label={busy ? "Cancel model setup" : "Unload local model"}
        quiet
        disabled={!status.available || (!busy && !status.ready)}
        onPress={() => void perform(unloadLocalModel)}
      />
      </>}
      <Button
        label={details ? "Hide model details" : "Model details"}
        quiet
        onPress={() => setDetails(!details)}
      />
      {details && (
        <>
          <Divider />
          <Body muted>Experimental prototype. Physical-device validation is pending. Unsupported builds use local conversation templates. Journal text, prompts, drafts and financial records stay in memory.</Body>
          <Body muted>Downloads use the public Hugging Face model source. Your writing is never included. There is no paid inference service; ordinary network/data charges may still apply.</Body>
          <Body>
            {LOCAL_MODEL.name} · {LOCAL_MODEL.license}
          </Body>
          <Body muted>
            {LOCAL_MODEL.bytes} bytes · SHA-256 {LOCAL_MODEL.sha256}
          </Body>
          <Body muted>
            Small English-language models can be inaccurate. Strict checks
            reject unsupported wording and use local templates instead. No model
            is a therapist or a substitute for human support.
          </Body>
        </>
      )}
    </View>
  );
}
