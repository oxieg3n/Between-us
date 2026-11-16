import type { RecipientCategory } from '../journal-intelligence';
export type RecipientPolicy = Readonly<{excludedContactIds:readonly string[];excludedCategories:readonly RecipientCategory[]}>;
export type ReviewedMessage = Readonly<{
  id: string;
  authorId: string;
  conversationId: string;
  peerId: string;
  body: string;
  response: string;
  recipientPolicy?: RecipientPolicy;
}>;
export function createReviewedSender(
  send: (message: ReviewedMessage) => Promise<void>,
  makeId: () => string,
) {
  let pending: ReviewedMessage | null = null,
    attempted = false,
    busy = false,
    lifetime = 0;
  return {
    reset() {
      lifetime++;
      pending = null;
      attempted = false;
      busy = false;
    },
    stage(value: Omit<ReviewedMessage, "id">): ReviewedMessage {
      if (attempted || busy)
        throw new Error(
          "Retry the same reviewed message until the server confirms its outcome.",
        );
      if (
        !value.body.trim() ||
        value.body.length > 5000 ||
        !value.peerId ||
        !value.conversationId
      )
        throw new Error("Choose a permitted recipient and write a message.");
      pending = Object.freeze({ ...value, ...(value.recipientPolicy ? {recipientPolicy:Object.freeze({excludedContactIds:Object.freeze([...value.recipientPolicy.excludedContactIds]),excludedCategories:Object.freeze([...value.recipientPolicy.excludedCategories])})}:{}), id: makeId() });
      return pending;
    },
    uncertain: () => attempted,
    async submit(current: { conversationId: string; peerId: string }) {
      if (
        !pending ||
        busy ||
        pending.conversationId !== current.conversationId ||
        pending.peerId !== current.peerId
      )
        throw new Error("Review these words for this recipient first.");
      const message = pending,
        version = lifetime;
      busy = true;
      attempted = true;
      try {
        await send(message);
        if (version !== lifetime)
          throw new Error("Account changed. Message result discarded.");
        pending = null;
        attempted = false;
      } catch (error) {
        if (
          version === lifetime &&
          error &&
          typeof error === "object" &&
          "confirmedRejected" in error &&
          error.confirmedRejected === true
        ) {
          pending = null;
          attempted = false;
        }
        throw error;
      } finally {
        if (version === lifetime) busy = false;
      }
    },
  };
}
