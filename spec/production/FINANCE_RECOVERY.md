# Financial command crash recovery

2026-11-16. Production finance now keeps one exact pending command per issuer, author, family and child. It saves and reads back the bounded envelope before a financial POST. It never persists a ledger/view, journal, session token, password or clock-derived event time. Server actor assignment, time, command fingerprint, atomic commit and append-only financial history remain authoritative.

Native storage uses the existing Expo SecureStore module with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and a separate keychain service. An existing Expo Crypto SHA256 digest of the canonical issuer/author/family/child tuple names the slot; there is no custom encryption implementation or new dependency. SecureStore protects the app's local record; app session/scope checks prevent another ordinary author from recovering it. This is not a claim that all authors have separate OS accounts or that a compromised/debug device cannot inspect app memory.

The browser adapter is explicitly memory-only. The UI explains that closing/reloading a browser page loses its local unknown retry identity. Browser development must not be presented as durable crash recovery.

## Write, recover and settle

1. Staging creates an immutable UUID/action for explicit review. An unsent review can be cancelled in memory.
2. Confirmation first persists `{version,scope,envelope:{id,action},outcome:"unknown"}` and verifies the stored bytes. An unavailable/locked store, oversized envelope, mismatched slot or failed verification prevents transport.
3. A timeout, process exit or ambiguous response leaves that same envelope. It cannot be replaced by a new command in the same scope.
4. Reopening fetches the current authorized server view first. Only then does it read and validate the scope's recovery record. It displays the exact original action, including cent units, dates and references. Mount/recovery/refresh performs no financial POST. The author must explicitly choose **Retry the same action**; UUID and action are unchanged.
5. A saved response or definitive first-request rejection is recorded as a `saved`/`rejected` marker before the slot is removed. A failed marker update/removal blocks another operation. If a known marker is recovered, **Finish confirmed recovery cleanup** retries local storage only, without another financial POST. No financial result/DTO is stored with the marker.

A later rejection of an already unknown/recovered retry does not prove whether the earlier request committed. Such a rejection keeps the original unknown record; current authorized access and a successful same-ID server replay are required to settle it. This avoids treating a later403 after withdrawal/sign-out as proof that an earlier monetary command never committed. A definitive first rejection, with no earlier unknown transmission, can clear after durable rejected-marker cleanup.

Each slot's read/compare/write/remove operations serialize in the current JavaScript runtime. Before replacement/removal, scope, UUID, action bytes and outcome transitions are checked. Unknown records cannot be removed through the store API. Late completions check the original screen/account lifetime and cannot clear another author's slot or a newer operation. Account events and unmount invalidate the old controller; existing `accountApi(..., expectedUserId)` additionally binds actual dispatch/result to the managed account lifetime. Current-view refresh failures conceal the prior view and pause recovered review/retry.

## Bounds and failures

The serialized envelope is limited to **1900 UTF8 bytes**, including scope and JSON overhead. Actions use an explicit field allowlist, required fields, bounded strings/arrays, primitive types and safe integers; server-owned identity/time/role fields are rejected. This is storage validation, not a second money engine. Oversized Unicode notes/instructions fail with a human message before transmission rather than silently truncating an action or regenerating its identity.

Malformed, foreign-scope or unknown-version bytes fail closed and remain untouched. No wipe, wildcard cleanup, new slot overwrite, background resend or automatic discard is offered. Storage keys, record bytes and private action contents are never logged. Failed storage cleanup keeps the author paused and exposes an explicit local-cleanup action only for a known result.

SecureStore can reject values on the underlying platform and is not the sole source of financial truth. The conservative byte limit handles the historical roughly2KiB iOS boundary while native errors still fail closed. Uninstall, app-data deletion, device loss, restore and OS/keychain changes can make recovery unavailable; iOS keychain retention across reinstall is not a backup guarantee. Existing native backup exclusions and physical-device policy require root verification. [Expo SDK58 SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).

## Verification and owner follow-up

The focused14 tests passed: eight new fake-storage recovery tests and all six existing financial scope/money/retry tests. They cover restart with exact UUID/body and no automatic send, issuer/author/family/child isolation, zero sends on storage failure, first rejection cleanup, saved/rejected removal failure, late old-author completion and compare-before-delete, malformed bytes, Unicode byte boundaries, and a rejected replay with an earlier unknown result. The original component-test change only maps its VM import to the extracted policy helper.

One full mobile typecheck completed successfully during development. Final full lint/typecheck are pending while the root's all-ABI native build consumes resources; the root asked the helper not to start further full checks. No package/client/backend/native/service/Git changes or native storage execution were performed by this helper. Root must run the final checks once after integration and validate SecureStore failures, real process death/reopen, lock/unlock, account switches, known-result cleanup, Android backup exclusions and iOS keychain behavior. Do not clear an unknown recovery slot merely to make a test pass.
