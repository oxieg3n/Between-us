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
  messagingBlocked?: boolean;
}

export type AuthorBlocks = Record<Role, readonly string[]>;

export function emptyAuthorBlocks(): AuthorBlocks {
  return { child: [], parent: [] };
}

// These two IDs identify fictional demo authors, never authenticated accounts.
const authorId = (role: Role) => (role === "child" ? "sam" : "alex");

export function blockForAuthor(
  blocks: AuthorBlocks,
  role: Role,
  contactId: string,
): AuthorBlocks {
  if (!contactId.trim() || contactId === authorId(role)) {
    throw new Error("Choose another person to block.");
  }
  if (blocks[role].includes(contactId)) return blocks;
  return { ...blocks, [role]: [...blocks[role], contactId] };
}

function exchangeBlocked(role: Role, contactId: string, blocks: AuthorBlocks) {
  if (blocks[role].includes(contactId)) return true;
  const recipientRole =
    contactId === "sam" ? "child" : contactId === "alex" ? "parent" : undefined;
  return !!recipientRole && blocks[recipientRole].includes(authorId(role));
}

/** Project only this author's blocks; a reverse block exposes generic unavailability. */
export function contactsForAuthor(
  base: readonly Contact[],
  role: Role,
  blocks: AuthorBlocks,
): Contact[] {
  return base.map((contact) => {
    if (!exchangeBlocked(role, contact.id, blocks)) return contact;
    return {
      ...contact,
      status: blocks[role].includes(contact.id) ? "blocked" : contact.status,
      messagingBlocked: true,
    };
  });
}

/** Approval alone never authorizes a connection to receive messages. */
export function canMessage(contact: Contact): boolean {
  return (
    contact.status === "verified" &&
    contact.accepted &&
    contact.verified &&
    !contact.messagingBlocked
  );
}

export function canExchange(
  role: Role,
  contact: Contact | undefined,
  blocks: AuthorBlocks,
): boolean {
  return (
    !!contact &&
    contact.id !== authorId(role) &&
    canMessage(contact) &&
    !exchangeBlocked(role, contact.id, blocks)
  );
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
