import { createReviewedSender, type ReviewedMessage } from './reviewed-send';

export type ReviewedThread = Readonly<{authorId:string;conversationId:string;peerId:string}>;
export type ReviewedSendScope = Readonly<{authorId:string;sessionKey:string}>;
export type PendingReviewedThread = ReviewedThread & Readonly<{uncertain:boolean}>;

/** Memory only. The caller creates a fresh controller for every verified author/session. */
export function createReviewedSendCoordinator(scope:ReviewedSendScope,
  send:(message:ReviewedMessage)=>Promise<void>,makeId:()=>string) {
  if (!scope.authorId || !scope.sessionKey) throw new Error('A current author and session are required.');
  const authorId = scope.authorId;
  let retired = false;
  const threads = new Map<string,{thread:ReviewedThread;sender:ReturnType<typeof createThread>}>();
  const current = () => { if (retired) throw new Error('Account changed. Message result discarded.'); };
  function createThread(thread:ReviewedThread) {
    let snapshot:ReviewedMessage|null = null,adopted = false,restoredId:string|null = null;
    const sender = createReviewedSender(async message => { current(); await send(message); },()=>restoredId ?? makeId());
    const scoped = (value:Omit<ReviewedMessage,'id'>) => {
      if (value.authorId !== authorId || value.conversationId !== thread.conversationId || value.peerId !== thread.peerId)
        throw new Error('Review these words for this author and recipient first.');
      return {authorId,conversationId:thread.conversationId,peerId:thread.peerId,
        body:value.body,response:value.response,...(value.recipientPolicy ? {recipientPolicy:{
          excludedContactIds:[...value.recipientPolicy.excludedContactIds],excludedCategories:[...value.recipientPolicy.excludedCategories],
        }} : {})};
    };
    const handle = {
      stage(value:Omit<ReviewedMessage,'id'>) {
        current();
        if (adopted) throw new Error('Retry the same reviewed message until the server confirms its outcome.');
        snapshot = sender.stage(scoped(value));
        return snapshot;
      },
      adopt(value:ReviewedMessage,options:{attempted:true}) {
        current();
        const command = scoped(value);
        if (options.attempted !== true || typeof value.id !== 'string' || !value.id.trim()
          || !['listen','reply','later','talk'].includes(value.response))
          throw new Error('The saved reviewed message cannot be restored safely.');
        if (snapshot) {
          if (JSON.stringify({...command,id:value.id}) !== JSON.stringify({...scoped(snapshot),id:snapshot.id}))
            throw new Error('Keep the original reviewed message before restoring another command.');
        } else {
          restoredId = value.id;
          try { snapshot = sender.stage(command); } finally { restoredId = null; }
        }
        adopted = true; return snapshot;
      },
      async submit(value:Pick<ReviewedThread,'conversationId'|'peerId'>) {
        current();
        if (value.conversationId !== thread.conversationId || value.peerId !== thread.peerId)
          throw new Error('Review these words for this recipient first.');
        try { await sender.submit(value); }
        finally { if (!retired && !sender.uncertain()) { snapshot = null; adopted = false; } }
      },
      uncertain: () => !retired && (adopted || sender.uncertain()),
      snapshot: () => retired ? null : snapshot,
    };
    return {handle,retire() { sender.reset(); snapshot = null; adopted = false; }};
  }
  return {
    forThread(value:ReviewedThread) {
      current();
      if (value.authorId !== authorId || !value.conversationId || !value.peerId)
        throw new Error('Choose a conversation belonging to this author.');
      const existing = threads.get(value.conversationId);
      if (existing) {
        if (existing.thread.peerId !== value.peerId) throw new Error('This conversation belongs to another recipient.');
        return existing.sender.handle;
      }
      const thread = Object.freeze({authorId,conversationId:value.conversationId,peerId:value.peerId}),sender = createThread(thread);
      threads.set(thread.conversationId,{thread,sender}); return sender.handle;
    },
    pendingThreads():readonly PendingReviewedThread[] {
      if (retired) return Object.freeze([]);
      return Object.freeze([...threads.values()].filter(({sender})=>sender.handle.snapshot())
        .map(({thread,sender})=>Object.freeze({...thread,uncertain:sender.handle.uncertain()})));
    },
    clearUnattempted() {
      if (retired) return;
      for (const {sender} of threads.values()) {
        if (sender.handle.snapshot() && !sender.handle.uncertain()) sender.retire();
      }
    },
    resetAll() {
      if (retired) return;
      retired = true;
      for (const {sender} of threads.values()) sender.retire();
      threads.clear();
    },
  };
}
