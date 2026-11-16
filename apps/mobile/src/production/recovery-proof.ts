type Session = { access_token: string; user: { id: string } };
export type RecoveryProof = Readonly<{ userId: string; token: string }>;
/** Only managed Auth events confer recovery authority; a URL query never does. */
export function createRecoveryProofState() {
  let current: RecoveryProof | null = null;
  return {
    update(event: string, session: Session | null) {
      if (event === 'PASSWORD_RECOVERY' && session) current = Object.freeze({ userId: session.user.id, token: session.access_token });
      else if (!session || current?.token !== session.access_token || current.userId !== session.user.id) current = null;
    },
    read() { return current; },
    require(proof: RecoveryProof) {
      if (!current || current.userId !== proof.userId || current.token !== proof.token) throw new Error('The recovery account changed. Request a new recovery code for your own account.');
    },
    clear() { current = null; },
  };
}
