type Client = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }> };
export type NotificationOutcome = "accepted" | "retry" | "invalid_token" | "failed";
export type ReceiptOutcome = "provider_received" | "retry" | "invalid_token" | "failed";
export const NEUTRAL_NOTIFICATION = Object.freeze({ title: "Between Us", body: "Open Between Us to check for updates." });
export type ExpoNotificationConfiguration = {
  enabled?: boolean;
  ownerApprovalId?: string;
  projectId?: string;
  credentialsReady?: boolean;
  /** Server-only enhanced push security token; never an Expo public variable or mobile key. */
  accessToken?: string;
};
type PushMessage = { to: string; title: string; body: string; data: { invalidationId: string }; ttl: 300; priority: "normal" };
export interface ExpoPushTransport {
  readonly operational: boolean;
  readonly unavailableReason?: "disabled" | "not_configured";
  send(message: PushMessage): Promise<{ outcome: NotificationOutcome; ticketId?: string; halt?: boolean }>;
  receipt(ticketId: string): Promise<{ outcome: ReceiptOutcome; halt?: boolean }>;
}
type DispatchLease = { id: string; leaseToken: string; deviceId: string; platform: "ios" | "android"; token: string; payload: { title: string; body: string; data: { invalidationId: string } } };
type ReceiptLease = { id: string; leaseToken: string; ticketId: string };
export type NotificationBatchResult = {
  status: "completed" | "busy" | "disabled" | "not_configured";
  attempted: number;
  providerAccepted: number;
  providerReceived: number;
  deferred: number;
  failed: number;
  suppressed: number;
  deviceDelivered: false;
  read: false;
};
export class NotificationWorkerError extends Error {
  constructor(readonly code: "storage" | "authorization" | "invalid_batch") { super(`Notification worker: ${code}.`); this.name = "NotificationWorkerError"; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ticket = /^[A-Za-z0-9_-]{1,200}$/;
const token = /^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{8,256}\]$/;
const sendUrl = "https://exp.host/--/api/v2/push/send";
const receiptUrl = "https://exp.host/--/api/v2/push/getReceipts";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]) => Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key));
const identifier = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
function validPayload(value: unknown, id: string): value is DispatchLease["payload"] {
  return object(value) && exact(value, ["title", "body", "data"]) && value.title === NEUTRAL_NOTIFICATION.title && value.body === NEUTRAL_NOTIFICATION.body &&
    object(value.data) && exact(value.data, ["invalidationId"]) && value.data.invalidationId === id;
}
function dispatchLease(value: unknown): DispatchLease {
  if (!object(value) || !exact(value, ["id", "leaseToken", "deviceId", "platform", "token", "payload"]) || !identifier(value.id) || !identifier(value.leaseToken) || !identifier(value.deviceId) ||
      !["ios", "android"].includes(String(value.platform)) || typeof value.token !== "string" || !validPayload(value.payload, value.id)) throw new NotificationWorkerError("invalid_batch");
  return value as unknown as DispatchLease;
}
function receiptLease(value: unknown): ReceiptLease {
  if (!object(value) || !exact(value, ["id", "leaseToken", "ticketId"]) || !identifier(value.id) || !identifier(value.leaseToken) || typeof value.ticketId !== "string" || !ticket.test(value.ticketId)) throw new NotificationWorkerError("invalid_batch");
  return value as unknown as ReceiptLease;
}
function pushMessage(lease: DispatchLease): PushMessage {
  return { to: lease.token, title: NEUTRAL_NOTIFICATION.title, body: NEUTRAL_NOTIFICATION.body, data: { invalidationId: lease.id }, ttl: 300, priority: "normal" };
}
function validMessage(message: PushMessage) {
  return object(message) && exact(message, ["to", "title", "body", "data", "ttl", "priority"]) && typeof message.to === "string" && token.test(message.to) && identifier(message.data?.invalidationId) &&
    message.ttl === 300 && message.priority === "normal" && validPayload({ title: message.title, body: message.body, data: message.data }, message.data.invalidationId);
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const value = await reader.read(); if (value.done) break; length += value.value.byteLength; if (length > 65_536) { await reader.cancel(); throw new Error(); } chunks.push(value.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
function providerError(value: Record<string, unknown>): { outcome: "retry" | "invalid_token" | "failed"; halt?: boolean } {
  const code = object(value.details) ? value.details.error : undefined;
  if (code === "DeviceNotRegistered") return { outcome: "invalid_token" };
  if (code === "MessageRateExceeded") return { outcome: "retry" };
  if (code === "InvalidCredentials" || code === "MismatchSenderId") return { outcome: "failed", halt: true };
  return { outcome: "failed" };
}

/** Thin fixed-endpoint HTTPS adapter. Injected fetch is for isolated tests, never a live-push shortcut. */
export function createExpoPushTransport(configuration: ExpoNotificationConfiguration = {}, request: typeof fetch = globalThis.fetch): ExpoPushTransport {
  const accessToken = configuration.accessToken;
  const operational = configuration.enabled === true && configuration.credentialsReady === true && typeof configuration.ownerApprovalId === "string" && configuration.ownerApprovalId.trim().length > 0 &&
    typeof configuration.projectId === "string" && uuid.test(configuration.projectId) && typeof configuration.accessToken === "string" && /^[A-Za-z0-9._~-]{1,2048}$/.test(configuration.accessToken);
  const unavailableReason = configuration.enabled !== true ? "disabled" as const : "not_configured" as const;
  async function post(url: string, body: unknown) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await request(url, { method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) });
      if (response.status === 429 || response.status === 408 || response.status >= 500) { await response.body?.cancel(); return { retry: true } as const; }
      if (!response.ok) { await response.body?.cancel(); return { failed: true, halt: response.status === 401 || response.status === 403 } as const; }
      const value = await boundedJson(response);
      if (!object(value) || value.errors !== undefined) return { retry: true } as const;
      return { data: value.data } as const;
    } catch { return { retry: true } as const; }
    finally { clearTimeout(timeout); }
  }
  return {
    operational, unavailableReason: operational ? undefined : unavailableReason,
    async send(message) {
      if (!operational) return { outcome: "failed", halt: true };
      if (!validMessage(message)) return { outcome: "failed" };
      const response = await post(sendUrl, message);
      if ("retry" in response) return { outcome: "retry" };
      if ("failed" in response) return { outcome: "failed", halt: response.halt };
      const value = response.data;
      if (!object(value)) return { outcome: "retry" };
      if (value.status === "ok" && typeof value.id === "string" && ticket.test(value.id)) return { outcome: "accepted", ticketId: value.id };
      if (value.status === "error") return providerError(value);
      return { outcome: "retry" };
    },
    async receipt(ticketId) {
      if (!operational) return { outcome: "failed", halt: true };
      if (!ticket.test(ticketId)) return { outcome: "failed" };
      const response = await post(receiptUrl, { ids: [ticketId] });
      if ("retry" in response) return { outcome: "retry" };
      if ("failed" in response) return { outcome: "failed", halt: response.halt };
      if (!object(response.data)) return { outcome: "retry" };
      const value = response.data[ticketId];
      if (!object(value)) return { outcome: "retry" };
      if (value.status === "ok") return { outcome: "provider_received" };
      if (value.status === "error") return providerError(value);
      return { outcome: "retry" };
    },
  };
}

/** Service-only client required. No public handler or background scheduler is installed here. */
export function createNotificationWorker(input: { serviceClient: Client; transport: ExpoPushTransport; monotonicNow?: () => number }) {
  let busy = false;
  const now = input.monotonicNow ?? (() => performance.now());
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const value = await input.serviceClient.rpc(name, args);
    if (value.error) throw new NotificationWorkerError(value.error.code === "42501" ? "authorization" : "storage");
    return value.data as T;
  }
  const result = (status: NotificationBatchResult["status"]): NotificationBatchResult => ({ status, attempted: 0, providerAccepted: 0, providerReceived: 0, deferred: 0, failed: 0, suppressed: 0, deviceDelivered: false, read: false });
  async function batch(mode: "dispatch" | "receipts", limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new NotificationWorkerError("invalid_batch");
    if (!input.transport.operational) return result(input.transport.unavailableReason ?? "not_configured");
    if (busy) return result("busy");
    busy = true; const report = result("completed"), deadline = now() + 45_000;
    try {
      const raw = await rpc<unknown>(mode === "dispatch" ? "lease_notifications" : "lease_notification_receipts", { p_limit: limit });
      if (!Array.isArray(raw) || raw.length > limit) throw new NotificationWorkerError("invalid_batch");
      // Validate the whole batch before sending anything; unexpected private metadata fails closed.
      const leases = mode === "dispatch" ? raw.map(dispatchLease) : raw.map(receiptLease);
      for (const lease of leases) {
        if (now() >= deadline) break; // Remaining SQL leases expire and can be reclaimed later.
        const args = { p_outbox_id: lease.id, p_lease_token: lease.leaseToken };
        const receiptMode = mode === "receipts";
        let allowed: boolean;
        try { allowed = await rpc<boolean>(receiptMode ? "authorize_notification_receipt" : "authorize_notification", args); }
        catch (error) { if (error instanceof NotificationWorkerError && error.code === "authorization") { report.suppressed++; continue; } throw error; }
        if (allowed !== true) {
          try { await rpc(receiptMode ? "complete_notification_receipt" : "complete_notification", { ...args, p_outcome: "failed" }); }
          catch (error) { if (!(error instanceof NotificationWorkerError && error.code === "authorization")) throw error; }
          report.suppressed++; continue;
        }
        // No intervening database/queue await between current authorization and external transport.
        report.attempted++;
        if (receiptMode) {
          const response = await input.transport.receipt((lease as ReceiptLease).ticketId);
          await rpc("complete_notification_receipt", { ...args, p_outcome: response.outcome });
          if (response.outcome === "provider_received") report.providerReceived++;
          else if (response.outcome === "retry") report.deferred++;
          else report.failed++;
          if (response.halt) break;
        } else {
          const selected = lease as DispatchLease;
          const response = token.test(selected.token) ? await input.transport.send(pushMessage(selected)) : { outcome: "invalid_token" as const };
          if (response.outcome === "accepted") {
            if (!response.ticketId || !ticket.test(response.ticketId)) throw new NotificationWorkerError("invalid_batch");
            await rpc("record_notification_ticket", { ...args, p_ticket_id: response.ticketId }); report.providerAccepted++;
          } else {
            await rpc("complete_notification", { ...args, p_outcome: response.outcome });
            if (response.outcome === "retry") report.deferred++; else report.failed++;
          }
          if ("halt" in response && response.halt) break;
        }
      }
      return report;
    } catch (error) {
      if (error instanceof NotificationWorkerError) throw error;
      throw new NotificationWorkerError("storage");
    } finally { busy = false; }
  }
  return {
    dispatch: (limit = 20) => batch("dispatch", limit), pollReceipts: (limit = 20) => batch("receipts", limit),
    async purgeReceipts(limit = 20) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new NotificationWorkerError("invalid_batch");
      try { const count = await rpc<number>("purge_notification_receipts", { p_limit: limit }); if (!Number.isSafeInteger(count) || count < 0 || count > limit) throw new NotificationWorkerError("invalid_batch"); return count; }
      catch (error) { if (error instanceof NotificationWorkerError) throw error; throw new NotificationWorkerError("storage"); }
    },
  };
}
