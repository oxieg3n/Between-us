/** Prototype checks only: these flags are fictional, not identity verification. */
export type Role = "child" | "parent";
export type ContactStatus =
  | "requested"
  | "approved"
  | "invited"
  | "accepted"
  | "verified"
  | "blocked"
  | "removed";

export interface Contact {
  id: string;
  name: string;
  category: string;
  status: ContactStatus;
  accepted: boolean;
  verified: boolean;
}

/** Approval alone never authorizes a connection to receive messages. */
export function canMessage(contact: Contact): boolean {
  return contact.status === "verified" && contact.accepted && contact.verified;
}

export function canManage(role: Role): boolean {
  return role === "parent";
}

export interface Reflection {
  topic: "school" | "general";
  suggestion: string;
  starter: string;
}

/** Call only after the author requests help. No entry text leaves this function. */
export function reflection(text: string): Reflection {
  const school =
    /\b(school|class|teacher|bully|bullied|bullying)\b|picked on|picking on/i.test(
      text,
    );
  return {
    topic: school ? "school" : "general",
    suggestion: school
      ? "Would you like to talk with someone you feel safe with, such as a trusted teacher or another trusted adult? You choose who, if anyone. You can prepare words to say in person."
      : "Would you like to talk with someone you feel safe with? You choose who, if anyone. That can be another trusted adult outside your family. You can prepare words to say in person.",
    starter: "Can we talk? I have something I would like you to listen to.",
  };
}
