# Native model setup visual review

Reviewed three original 1080×2424 Android PNGs from `com.oxieg3n.betweenus`, Android 17, emulator-5554. Their SHA-256 values were recomputed and match the capture manifests. No images were modified.

| Evidence | Finding |
| --- | --- |
| [r1 setup](1115-model-setup-20261115/light/model-setup.png) | Long explanatory text and repeated experimental-status wording push both setup actions below the initial viewport. The heading is clear, but the next action is difficult to discover without scrolling. |
| [r2 setup](1115-model-setup-r2b-20261115/light/model-setup.png) | Shorter introductory/status copy brings **Download & load optional model** and **Load downloaded model** fully into view. Download size, storage needs and memory-only writing remain visible. Editorial typography, restrained Ocean Blue and the four-tab navigation are preserved. |
| [r2 download consent](1115-model-setup-r2b-20261115/light/download-consent.png) | The actual native dialog clearly explains the 369 MiB public model, Apache-2.0 license, SHA-256 check and retained model files. Confirm and Cancel are fully visible; no modal text or essential action is clipped in this capture. |

The r2 layout corrects the main first-screen hierarchy problem. Its disabled **Unload local model** label begins at the lower viewport edge; lower controls still need a scrolled interaction check and capture. This partial label alone does not prove that the control is unreachable. The nested Back/settings controls and all bottom-navigation labels remain visible.

Two capture-harness defects were separate from the app's layout: the first setup attempt incorrectly treated an offscreen control as unavailable because it used `find` rather than scrolling `locate`; an initial r2 attempt opened settings before the onboarding transition settled. Scrolling lookup and `wait_visible` after **Explore as Sam** corrected those assumptions. Earlier partial/failed runs were preserved under [r1 setup evidence](../chores-goals/1115-model-setup-20261115/), [initial r2 attempt](../chores-goals/1115-model-setup-r2-20261115/) and [r2 recapture](../chores-goals/1115-model-setup-r2b-20261115/).

Scope: these light-mode images establish setup layout and explicit consent only. The captured setup manifests are partial (`completed: false`); they do not establish completed download, successful hash verification, model loading or inference. Dark mode, 200% text, smaller screens, screen-reader behavior and actual model-result validation require their own native checks. No inference-success claim is made by this review.

## r3 restart regression and r4 correction

The [r3 unavailable-model screenshot](1115-r3-journal-native/light/optional-model-unavailable.png) and [capture manifest](1115-r3-journal-native/capture-manifest.json) record a real failure after restarting the app and selecting **Load downloaded model**. The manifest identifies build `1115-FamilyEnvelopes-Journal-r3`, source `f65a319731da6dd860b9a49b282be66a69afd98f`, a clean tracked source tree, and `completed: false`. The original screenshot remains preserved with SHA-256 `903e8af9ba0a3bab5ea7d0ac7548f859654fa54006ed978b4741d29f5b1eb2a5`.

The master's native filesystem inspection found the model directory empty after the earlier r2 ready state. This was a **missing downloaded asset**, not an unsupported native module or a file-digest API failure. Expo `File.move` updates the source object's `uri`; the old cleanup then called `partial.delete()` on that moved object and deleted the final model file. A loaded context could temporarily conceal the defect until process restart.

The r4 correction uses `withModelDownloadFile` to retain the original temporary URI and construct cleanup against that original location, rather than the moved model object. The master reports **67/67 unit tests passing**, including successful download, download-failure and load-failure cleanup cases. Those tests were not rerun by this report reviewer. Actual r4 download, persistence across restart and integrated inference remain pending at this checkpoint.

The r3 image displays a clear fallback/error notice and intact navigation, but repeats similar error wording farther down the page. That pushes retry/setup actions below the initial viewport again. The generic “check storage, connection and build support” message also does not identify the missing-file cause. This is a remaining error-state clarity/layout concern; the screenshot alone does not prove those actions are unreachable.

Acceptance for the next native recapture must include: complete the explicit download and hash check; observe ready status; restart the app; load the **existing** model without another download; then obtain an accepted native journal suggestion with its actual source label and explicit message review. A ready label in the same process is insufficient. Preserve r1/r2/r3 evidence and record any fallback honestly; this review does not mark generation complete.
