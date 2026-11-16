import type { Contact } from "../communication";
import { recipientBoundaries, type RecipientCategory } from "../journal-intelligence";

/** Metadata projection returned only by authorized list_contacts; never a permission grant. */
export type AuthorizedJournalContact = {
  id: string; familyId: string | null; a: string | null; b: string | null;
  aName: string | null; bName: string | null;
  acceptedByMe: boolean | null; bothAccepted: boolean; approvalA: boolean; approvalB: boolean;
  verified: boolean; external: boolean; managedChildId: string | null; managedChildName: string | null;
  revoked: boolean; canExchange: boolean; peerCategory: "parent" | "child" | "trusted-person" | null;
};
type Preparation = { excludedContactIds: readonly string[]; excludedCategories: readonly RecipientCategory[]; text?: string };
function peer(row: AuthorizedJournalContact, ownId: string) {
  if (!row || !row.bothAccepted) return undefined;
  if (row.a === ownId && row.b && row.b !== ownId && typeof row.bName === "string" && row.bName.trim()) return { id: row.b, name: row.bName };
  if (row.b === ownId && row.a && row.a !== ownId && typeof row.aName === "string" && row.aName.trim()) return { id: row.a, name: row.aName };
  return undefined;
}
export function journalContacts(rows: readonly AuthorizedJournalContact[], ownId: string): Contact[] {
  return rows.flatMap(row => {
    const person = peer(row, ownId); if (!person) return [];
    return [{ id: person.id, name: person.name, category: row.peerCategory === "parent" ? "Parent / guardian" : row.peerCategory === "child" ? "Child" : "Unknown trusted person",
      accepted: row.bothAccepted, verified: row.verified, status: row.revoked ? "removed" : row.verified ? "verified" : "accepted", messagingBlocked: !row.canExchange }];
  });
}
/** Conservative local exclusion only; the server still authorizes Review/send independently. */
export function safePreparedContacts(rows: readonly AuthorizedJournalContact[], ownId: string, preparation: Preparation): AuthorizedJournalContact[] {
  const derived = recipientBoundaries({ text: preparation.text ?? "", role: "child", contacts: journalContacts(rows, ownId) });
  const excluded = new Set([...preparation.excludedContactIds, ...derived.excludedContactIds]);
  const categories = new Set([...preparation.excludedCategories, ...derived.excludedCategories]);
  return rows.filter(row => {
    const person = peer(row, ownId);
    if (!person || row.revoked || !row.verified || !row.canExchange || excluded.has(row.id) || excluded.has(person.id)) return false;
    if (categories.size && row.peerCategory !== "parent" && row.peerCategory !== "child") return false;
    if (row.peerCategory === "parent" && (categories.has("parent") || categories.has("co-parent"))) return false;
    if (row.peerCategory === "child" && (categories.has("child") || categories.has("friend") || categories.has("sibling"))) return false;
    return true;
  });
}
