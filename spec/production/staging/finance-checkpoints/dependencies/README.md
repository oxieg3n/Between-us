# Finance checkpoint dependency evidence

This is a fresh metadata scan completed on 2026-11-17 UTC, plus fresh npm registry advisory checks for both packages. The [scan receipt](SCAN_RECEIPT.json) records timestamps, commands, package/lock SHA-256 values and the preserved historical inventories. No package was installed or upgraded. No build, Git, Docker or ADB operation was performed. Private configuration was not inspected or copied into the evidence.

The [SPDX 2.3 inventory](SBOM.json) contains **992 components**: 981 npm lock locations, three repository/package records, seven explicit native metadata entries and one optional model metadata entry. The npm locations form 881 distinct name/version/license groups. Installed metadata matches 882 locations; 785 locations have observed top-level LICENSE/NOTICE/COPYING files. Matching metadata does not verify installed package bytes. Platform-specific or otherwise unmatched lock entries remain in the inventory.

| Scope | Lock locations | Installed metadata matches | Locations with notice evidence | Declared-license NOASSERTION |
| --- | ---: | ---: | ---: | ---: |
| Mobile | 911 | 845 | 751 | 1 |
| Backend | 70 | 37 | 34 | 0 |

Both fresh `npm audit --json --ignore-scripts` requests completed with exit 0 and **zero info, low, moderate, high or critical advisories**. Their sanitized aggregate records are [mobile audit](mobile-npm-audit-20261117013101461-f6d2d08f.json) and [backend audit](backend-npm-audit-20261117013101280-9ca19e1c.json). Package manifests and lockfiles remained unchanged before/after each command. These are known-advisory results, not native binary, supply-chain or security certification.

The [license mapping](DEPENDENCY_LICENSES.md) preserves declarations and notice-file hashes without legal conclusions. `node-forge@1.4.3` has the raw declaration `(BSD-3-Clause OR GPL-2.0)`; the conservative SPDX allowlist does not accept that legacy identifier expression, so this location remains `NOASSERTION`. This does not assert that its license text is absent. All 992 `licenseConcluded` values remain `NOASSERTION`.

Standalone native notice/version evidence is still `NOASSERTION` for ggml, SQLCipher, SQLite3 and Hermes. The inventory observes selected vendored MIT/Apache notices for llama.cpp, codec.cpp and OpenCL-Headers, without establishing their complete artifact composition. Maven/Gradle, CocoaPods, crypto dependencies, downloaded native artifacts, platform frameworks and final fonts/assets still require artifact-specific notice review. The `llama.rn` release-candidate compatibility gate remains open.

The optional SmolLM2 entry is transcribed from the existing pinned public evaluation record. No model bytes or fresh publisher license were fetched. Model redistribution provenance and the required full license/NOTICE remain review gates. The Expo template MIT notice is not a blanket grant for the application, brand or model assets.

The reviewed [original generator](../../../../../services/backend/scripts/release-inventory.mjs) was **not executed**, because its default output would overwrite the historical release inventory. The adapted [inventory helper](inventory.mjs) changes only repository/output paths and adds create-new output guards; its original/adapted hashes are recorded in the receipt. [Inputs before scanning](INPUTS_BEFORE.json) and the final receipt confirm that both prior inventory locations stayed unchanged.

Actual PowerShell commands, run from `D:\projects\BetweenUs`:

```powershell
node .\spec\production\staging\finance-checkpoints\dependencies\inventory.mjs
.\spec\production\staging\finance-checkpoints\dependencies\audit.ps1 -Scope mobile
.\spec\production\staging\finance-checkpoints\dependencies\audit.ps1 -Scope backend
```

The inventory helper refuses to overwrite its existing SPDX/Markdown snapshots. A later scan needs a separately reviewed destination. The [audit collector](audit.ps1) writes a new timestamped, exclusive-create aggregate file on each run and discards raw registry error details.

JSON parsing, unique SPDX package identifiers and resolved relationship references passed local structural checks. No formal SPDX schema validator, complete native notice assembly, legal approval or signed-artifact qualification is claimed.
