import type { Role } from "./communication";
import type { Message } from "./model";

export const personId = (role: Role) => (role === "child" ? "sam" : "alex");

/** The fictional fixture has two account authors, never anonymous senders. */
export function threadFor(
  messages: Message[],
  role: Role,
  contactId: string,
): Message[] {
  return messages.filter(
    (message) =>
      (message.author === role && message.recipient === contactId) ||
      (message.author !== role &&
        personId(message.author) === contactId &&
        message.recipient === personId(role)),
  );
}

export function messageTime(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "Example";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function messageDay(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "Example conversation";
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}
