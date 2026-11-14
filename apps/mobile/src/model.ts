import {
  canManage,
  canMessage,
  type Contact,
  type Role,
} from "./communication";
export type Entry = { id: string; title: string; body: string };
export type Message = {
  id: string;
  author: Role;
  recipient: string;
  text: string;
  response: string;
};
export type Checkin = {
  id: string;
  prompt: string;
  schedule: string;
  status: "open" | "skipped" | "later";
};
export const seedContacts: Contact[] = [
  {
    id: "alex",
    name: "Alex - parent",
    category: "Parent / guardian",
    status: "verified",
    accepted: true,
    verified: true,
  },
  {
    id: "sam",
    name: "Sam - teen",
    category: "Family",
    status: "verified",
    accepted: true,
    verified: true,
  },
  {
    id: "lee",
    name: "Teacher Lee",
    category: "School staff",
    status: "invited",
    accepted: false,
    verified: false,
  },
];
export const initialJournals: Record<Role, Entry[]> = {
  child: [
    {
      id: "child-example",
      title: "A little space to think",
      body: "I would like to tell someone about my school project.",
    },
  ],
  parent: [
    {
      id: "parent-example",
      title: "Finding a beginning",
      body: "I want to make time to listen this weekend.",
    },
  ],
};
export function updateContact(
  role: Role,
  contacts: Contact[],
  id: string,
  status: "approved" | "removed" | "blocked",
): Contact[] {
  if (status !== "blocked" && !canManage(role)) return contacts;
  return contacts.map((c) =>
    c.id === id ? { ...c, status, accepted: false, verified: false } : c,
  );
}
export function createMessage(
  role: Role,
  contact: Contact | undefined,
  text: string,
  response: string,
): Message | undefined {
  if (!contact || !canMessage(contact) || !text.trim()) return;
  return {
    id: `${Date.now()}-${Math.random()}`,
    author: role,
    recipient: contact.id,
    text: text.trim(),
    response,
  };
}

let sequence = 0;
export function newId() {
  return "local-" + ++sequence;
}
