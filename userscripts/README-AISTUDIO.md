# AI Studio userscripts 1.1

1.1: mobile prompt focus fixed for real phones. Android ignores a scripted focus() until you have touched the page, so 1.0's retry loop never placed the cursor there. The script now also focuses the prompt box from inside your first real tap on empty page space, which is the only way Android lets anything open the keyboard, and places the caret explicitly. A tap on the box, another text field, the gear, or any control keeps its own meaning. Both scripts now carry @updateURL/@downloadURL pointing at the main-branch files below, so Tampermonkey's update check pulls future versions with no copy-paste. If you installed 1.0 from a commit-pinned link, install once from the main-branch link below; after that, Dashboard update checks are enough.

Desktop and mobile scripts default new, empty AI Studio chats to Google Search on. They apply model/thinking/system instructions, close the right run-settings sidebar, then focus the prompt box. The default instruction seed adds "No citations, references or source links." This is a model instruction, not a guarantee that AI Studio source cards disappear. Unedited bundled defaults migrate once; custom instructions are kept. No citation-hiding CSS is added.

The normal mobile defaults-success toast is gone; errors and DesVoice-link delivery messages stay visible.

Desktop gear: starts beside Playground in the navigation, can be dragged with mouse or touch, and remembers its position in this browser. Arrow keys move it, Shift+arrow moves farther, and Home resets it beside Playground. The settings card stays within the viewport.

Install only one variant per browser. Open the matching `.user.js` download in Tampermonkey, or use Dashboard > Utilities > Import from file. This is a userscript, not a Firefox add-on package. Refresh AI Studio after updating. Existing saved instructions and script identity are preserved.

Google Search must be offered and enabled by the selected model. The script waits up to 10 seconds for the Search switch. Controls arriving later require a new chat or explicit reapply; the hidden sidebar is not polled. An unavailable, disabled or rejected switch is reported, not claimed as enabled. Automatic defaults do not change existing conversations or typed prompts. A hidden sidebar is not reopened on a timer, so resets while hidden cannot be detected until a new chat/model navigation or explicit apply. Physical Android, Firefox/Tampermonkey end-to-end and automatic soft-keyboard opening are not verified for 1.1: the tap-to-focus path was verified with trusted taps in live Chromium at phone width, not on real Android Firefox.

## Verification

Syntax checks and Chromium fixture scenarios cover normal and failure paths, width 390 and 1280, text preservation, unsupported Search, delayed controls, stable sidebar hiding, DesVoice links, mouse/touch dragging, persistence, keyboard movement and viewport clamping. Live AI Studio desktop and mobile-width controls were inspected and operated without submitting a prompt. This live control check is separate from executing the userscripts in fixtures.

## Changes and lessons

- Desktop previously closed a temporary sidebar before applying instructions. All default steps now run inside the settings transaction and close at the end.
- Timed closed-sidebar rechecks contradicted auto-hide. Removed them rather than repeatedly pulling focus and settings open.
- Search is checked independently even if an earlier default fails. Repeated retries stop when Search is unsupported or disabled.
- Fixture testing found unsupported-Search retries reopening the sidebar, and inherited button margin causing saved gear coordinates to drift. Both have regression coverage.
- A separate static review found skipped Search on desktop errors, absent failure focus, weak close detection and a weak toast assertion. These were corrected and retested. This was not an independent browser execution review.

## Developer checks

Run `node --check` on both `.user.js` files. The fixture suite uses Playwright with Chrome; set `AI_STUDIO_SCRIPTS_DIR` to the directory holding `desktop.user.js` and `mobile.user.js`, and optionally `QC_FILTER` for a scenario-name pattern. No AI prompt is sent by the fixture tests.
