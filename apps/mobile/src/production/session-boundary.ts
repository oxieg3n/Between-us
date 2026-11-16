type Session = { access_token: string; user: { id: string } };
/** Bind payload and result to one account lifetime, before dispatch as well as afterwards. */
export async function withSessionBoundary<T>(ports: {
  epoch: () => number;
  readSession: () => Promise<Session | null>;
  send: (session: Session | null) => Promise<T>;
  allowAnonymous?: boolean;
  expectedUserId?: string;
}): Promise<T> {
  const lifetime = ports.epoch();
  const session = await ports.readSession();
  if (lifetime !== ports.epoch())
    throw new Error("Account changed before dispatch. Nothing was sent.");
  if (!session && !ports.allowAnonymous)
    throw new Error("Sign in to continue.");
  if (ports.expectedUserId && session?.user.id !== ports.expectedUserId)
    throw new Error(
      "The active account is different from the author of this action. Nothing was sent.",
    );
  const result = await ports.send(session);
  if (lifetime !== ports.epoch())
    throw new Error("Account changed. This result was discarded.");
  return result;
}
