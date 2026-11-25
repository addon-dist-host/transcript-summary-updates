# AI Studio userscript 8.4

8.1: desktop "Save and apply now" no longer races the background drift check and retries a not-yet-drawn model list before reporting a miss. The phone path is unchanged from 8.0.

8.0: one script for phone and desktop. Install `ai-studio-max-thinking.user.js` (the canonical install). It chooses phone or desktop behaviour when the page loads (touch screen or a phone browser means phone). It is one file with two device-specific code paths, not one shared engine.

- Phone path: gear in the top bar next to the plus icon, tap-to-focus for the prompt box, model field, `#dv=` links, the optional background log and its paired upload. While AI Studio's own Run settings panel is open, the gear moves to the bottom right so it does not cover the panel header.
- Desktop path: movable gear (starts beside Playground, drag or arrow keys, Home resets), Thinking level choice, "Save and apply now", re-checks of an empty new chat, model default Hydrogen.
- Both: highest thinking level the model offers, Google Search on, your default system instructions (text you typed yourself is kept), prompt box focus. Existing saved settings are read from their old places, nothing needs re-entering.
- Every line of text in the settings card is 14px on both.
- The desktop failure pop-up is gone; problems go to the card log and the browser console.
- Model matching now prefers the model's own id over an alias that only mentions it in its description (for example `gemini-3.5-flash-lite` no longer lands on "Flash-Lite Latest").
- The desktop state line no longer shows "thinking now: ?" when the panel is closed. It shows the last value read with the panel open. Apply results now include a read-back of thinking level and model taken from the live controls. Early "settings button not found" attempts right after page load are waiting, not failures.
- 8.3, phone path, optional background log only: logs failed or slow AI Studio API calls from the browser's own request-timing list, read passively (nothing is intercepted). Fixed wording only: `request <method from a fixed list, or Other> status <0|2xx|3xx|4xx|5xx> <time bucket>`, logged only for a non-2xx status or a call of 30 s or more. Status 0 means the browser reported no status (abort, block, failed connection or status not exposed; it does not say which). A call that never finishes may leave no entry. A 4xx or 5xx status says the server answered with that code; it does not say why. The browser must support `responseStatus` (Firefox 129+, Chrome 109+); on older browsers nothing is logged. No address, header, body, token, prompt or reply is read or stored.
- 8.4, phone path: settings always come first for a `#dv=` request: model, thinking level, system instructions and Google Search are applied before the prompt is put in the box (8.3 put the prompt in first; that is reverted). Waits trimmed: 0.8 s before the settings (was 1.2 s), 0.4 s after (was 0.6 s), settings-wait polling every 0.1 s (was 0.3 s). Chrome only: all settings applied by about 3.4 s, prompt in at about 3.5 s, one 18-character prompt tested.

## Install and replace

Open `https://raw.githubusercontent.com/addon-dist-host/transcript-summary-updates/main/userscripts/ai-studio-max-thinking.user.js` in Tampermonkey. A phone that already has "DesVoice to AI Studio" updates in place.

On a desktop that has "AI Studio Desktop Defaults" (`ai-studio-desktop-defaults.user.js`): install the file above, then disable or delete the old desktop script in the Tampermonkey dashboard. The old file is left unchanged at its old address and is not updated. Running both is not supported: in a Chrome test the two engines interfered with each other. How a script manager treats a changed name on update was not tested, which is why the old desktop address is not rewritten.

## What was and was not tested

Chrome only (cloud Chrome, desktop 1280x720 and 900x420, phone preset 390x844 and 390x480), no prompt sent. Read back through the real Run settings panel: Hydrogen, Extra High, system instructions filled, Search on on a new chat; a non-default model (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`) selected from the saved setting on phone path and desktop path; an existing saved chat was not changed; text typed by hand in system instructions was kept. Not tested: Firefox, Firefox Android, Tampermonkey, the real on-screen keyboard, two copies installed in two managers.

## Search and limits

Google Search must be offered and enabled by the selected model. An unavailable switch is reported, not claimed as enabled.
