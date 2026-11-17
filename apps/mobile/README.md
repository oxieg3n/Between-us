# Between Us mobile

Current fictional/local qualification build: **1116-FinanceCheckpoints-r3**, version0.6.0 (Android code5 / iOS source build5). The Open Letter design and Safe Harbor/Night Harbor themes are preserved.

Production mode uses the local Supabase Auth/database and authorized API for distinct accounts, family permissions, messaging and the transactional financial ledger. Financial checkpoints bound ordinary replay while immutable events and archived correction sources remain retained. Parent matching history is parent-only. Payments are family reports; no money is transferred.

The isolated r12 demo remains memory-only. It is separate from authenticated mode. Public enrollment, real-child data and hosted production deployment remain disabled. Native journals and protected drafts use their separately reviewed author-local domain; browser journal storage remains unavailable.

With the existing fictional local stack/API, debug APK and Pixel_10 ready:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs'
.\Scripts\Start-ProductionAndroid.ps1 -Serial 'emulator-5554'
```

The guarded helper verifies the selected checkout, package, local endpoints and Metro8081. It preserves unrelated processes and does not install or provision anything. See [first-time setup](../../spec/production/runbooks/LOCAL_AND_CI.md) and [Android startup](../../spec/production/ANDROID_LAUNCH.md). Expo Go cannot provide the protected native storage/runtime.

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\apps\mobile'
npm run typecheck
npm run lint
npm test
```

[Current qualification](../../spec/production/staging/FINAL_RELEASE_QUALIFICATION.md), [checkpoint evidence](../../spec/production/staging/FINANCE_CHECKPOINT_REPORT.md) and [design system](../../design/OPEN_LETTER_DESIGN_SYSTEM.md) distinguish local results from remaining hosted, hardware, legal and operational release gates. No signed release or iOS runtime result is claimed.
