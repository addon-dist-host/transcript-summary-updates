// ==UserScript==
// @name         AI Studio Desktop Defaults
// @namespace    com.des.aistudio-defaults
// @version      0.8
// @description  Desktop AI Studio: every new chat and every visit starts on your chosen model (default Hydrogen) at the highest thinking level. Change the defaults with the gear button at the bottom left.
// @match        https://aistudio.google.com/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const VERSION = '0.8';
  if (window.top !== window.self) return;
  const STORE = 'aistudio-desktop-defaults';
  // Short event log shown in the settings card, so a screenshot tells what the script did and why.
  const LOG = [];
  const stamp = () => new Date().toTimeString().slice(0, 8);
  const logEvent = (message) => {
    LOG.push(stamp() + ' ' + message);
    while (LOG.length > 10) LOG.shift();
    const box = document.getElementById('aisd-log');
    if (box) box.textContent = LOG.join('\n');
  };
  const DEFAULTS = { enabled: true, model: 'hydrogen', thinking: 'highest', sysOn: false, sys: '', sysLast: '' };
  const loadSettings = () => {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (error) { return Object.assign({}, DEFAULTS); }
  };
  const saveSettings = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (error) { /* ignore */ } };

  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const visible = (e) => {
    if (!e || !e.getBoundingClientRect) return false;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const label = (e) => ['aria-label', 'placeholder', 'title', 'mattooltip', 'data-test-id'].map((a) => e.getAttribute(a) || '').join(' ').toLowerCase();
  const text = (e) => (e.innerText || e.textContent || '').trim();
  const all = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
  const clickables = () => all('button,[role="button"],[role="combobox"],[role="switch"],mat-select');
  const until = async (find, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const found = find();
      if (found) return found;
      await sleep(300);
    }
    return null;
  };
  const toast = (message) => {
    const box = document.createElement('div');
    box.textContent = 'DesVoice: ' + message;
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;padding:10px 14px;border-radius:10px;background:#222;color:#fff;font:14px sans-serif';
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 7000);
  };
  const escape = () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    const backdrop = document.querySelector('.cdk-overlay-backdrop');
    if (backdrop) backdrop.click();
  };
  const editor = () => {
    const boxes = all('textarea,[contenteditable="true"]').filter((e) => !/system/.test(label(e)));
    return boxes.find((e) => /prompt|type something|start typing|message|ask/.test(label(e))) || boxes[boxes.length - 1] || null;
  };
  const setText = (e, value) => {
    e.focus();
    if (e.tagName === 'TEXTAREA' || e.tagName === 'INPUT') {
      const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, value);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, value);
    }
  };

  // 2. Run settings. On a phone the settings panel is closed, so open it first and close it after.
  const thinkingSelect = () => all('mat-select').find((e) => /thinking/.test(label(e))) || null;
  const panelToggle = () => clickables().find((e) => /run settings/.test(label(e)) && /toggle|open|show/.test(label(e)));
  const closePanelButton = () => clickables().find((e) => /close run settings/.test(label(e)));
  const withSettings = async (work) => {
    let opened = false;
    if (!thinkingSelect() && !modelButton()) {
      const toggle = panelToggle();
      if (!toggle) return { ok: false, note: 'could not find the run settings button' };
      toggle.click();
      opened = true;
      await until(() => thinkingSelect() || modelButton(), 4000);
      await sleep(400);
    }
    const before = document.activeElement;
    let result;
    try {
      result = await work();
    } catch (error) {
      result = { ok: false, note: 'unexpected error: ' + error.message };
    }
    if (opened) {
      const close = closePanelButton() || panelToggle();
      if (close) close.click();
    }
    try { if (before && before.focus) before.focus(); } catch (error) { /* ignore */ }
    return result;
  };

  // The model button in the settings panel shows the model name followed by its id, e.g. "gemini-4-hydrogen".
  const MODEL_ID = /\b(?:gemini|gemma)[a-z0-9.]*(?:-[a-z0-9.]+)+\b/;
  const modelInfo = (e) => (label(e) + ' ' + text(e).toLowerCase());
  const modelButton = () => all('button').find((e) => !e.closest('ms-chat-turn') && text(e).length < 400 && MODEL_ID.test(modelInfo(e))) || null;
  const modelKey = () => {
    const b = modelButton();
    return b ? (modelInfo(b).match(MODEL_ID) || [''])[0] : '';
  };

  const clearModelSearch = () => {
    const clear = all('button').find((e) => /clear search/.test(label(e)) || /clear search/.test(text(e).toLowerCase()));
    if (clear) { clear.click(); return; }
    const box = all('input').find((e) => /search|filter|find/.test(label(e)) && !e.closest('#aisd-card') && e.value);
    if (box) setText(box, '');
  };
  const chooseModel = async (model) => {
    const wanted = model.toLowerCase();
    const button = modelButton();
    if (!button) return { ok: false, note: 'no model control found' };
    if (modelInfo(button).includes(wanted)) return { ok: true, note: 'model already ' + model };
    button.click();
    await sleep(900);
    const findHit = () => all('.cdk-overlay-container button,.cdk-overlay-container [role="option"],.cdk-overlay-container mat-option,.cdk-overlay-container [role="menuitem"],.cdk-overlay-container [role="radio"],.cdk-overlay-container li,button')
      .filter((e) => !e.closest('#aisd-card') && e !== button && text(e).length < 900 && (' ' + text(e).toLowerCase() + ' ').includes(wanted) && /\b(?:gemini|gemma)[a-z0-9.]*(?:-[a-z0-9.]+)+\b/.test(text(e).toLowerCase()))
      .sort((x, y) => text(x).length - text(y).length)[0];
    // Look in the full list first; type in the search box only if the model is not visible, and clear it again afterwards.
    let hit = await until(findHit, 2500);
    let typed = null;
    if (!hit) {
      typed = all('input').find((e) => /search|filter|find/.test(label(e))) || null;
      if (typed) {
        setText(typed, model);
        await sleep(900);
        hit = await until(findHit, 4000);
      }
    }
    if (!hit) {
      escape();
      return { ok: false, note: model + ' not listed' };
    }
    hit.click();
    await sleep(1200);
    clearModelSearch();
    if (!modelButton()) { // on a phone the settings panel closes after picking a model: open it again
      const toggle = panelToggle();
      if (toggle) toggle.click();
      await until(modelButton, 3000);
      await sleep(400);
    }
    const now = modelButton();
    if (!now || !modelInfo(now).includes(wanted)) return { ok: false, note: 'could not confirm model ' + model };
    return { ok: true, note: 'model ' + model };
  };

  // Rank thinking options by meaning, not by position. Skips Auto/Default/Dynamic.
  // Returns null (so nothing is changed) when any option is not understood.
  const LEVELS = [
    [/^(off|none|no thinking|disabled)$/, 0],
    [/^minimal$/, 1],
    [/^low$/, 2],
    [/^medium$/, 3],
    [/^high$/, 4],
    [/^(extra high|extra-high|xhigh|x-high|very high|ultra)$/, 5],
    [/^(max|maximum)$/, 6],
  ];
  const highestOption = (options) => {
    const scored = [];
    for (const option of options) {
      const name = text(option).toLowerCase().replace(/\s+/g, ' ');
      if (/\b(auto|automatic|default|dynamic|adaptive)\b/.test(name)) continue;
      const level = LEVELS.find(([re]) => re.test(name));
      if (level) { scored.push({ option, score: level[1] }); continue; }
      const number = name.match(/^(?:max(?:imum)?\s*)?([\d,]+)\s*(?:tokens?)?$/);
      if (number) { scored.push({ option, score: 1000 + Number(number[1].replace(/,/g, '')) }); continue; }
      return null;
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    return scored[0].option;
  };

  // levels = list of acceptable names in order of preference; null means "highest the model offers".
  const chooseThinking = async (levels) => {
    const control = await until(thinkingSelect, 2500);
    if (!control) return { ok: false, note: 'no thinking level control for this model' };
    control.click();
    await sleep(700);
    const options = all('mat-option,[role="option"]').filter((e) => e.getAttribute('aria-disabled') !== 'true');
    if (!options.length) {
      escape();
      return { ok: false, note: 'thinking levels did not open' };
    }
    let pick = null;
    if (levels && levels.length) {
      for (const level of levels.map((s) => String(s).toLowerCase())) {
        pick = options.find((e) => text(e).toLowerCase() === level);
        if (pick) break;
      }
    } else {
      pick = highestOption(options);
      if (!pick) {
        escape();
        return { ok: false, note: 'not sure which thinking option is highest (' + options.map(text).join(', ').slice(0, 100) + '), left unchanged' };
      }
    }
    if (!pick) {
      escape();
      return { ok: false, note: 'thinking level not offered (' + options.map(text).join(', ').slice(0, 100) + ')' };
    }
    const name = text(pick);
    pick.click();
    await sleep(600);
    const shown = thinkingSelect();
    if (!shown || !text(shown).toLowerCase().includes(name.toLowerCase())) return { ok: false, note: 'could not confirm thinking ' + name };
    return { ok: true, note: 'thinking ' + name };
  };


  const chatIsEmpty = () => !document.querySelector('ms-chat-turn');
  // AI Studio can prefix the path with the Google account number, e.g. /u/0/prompts/new_chat.
  const onNewChat = () => /^(\/u\/\d+)?\/prompts\/new_chat/.test(location.pathname);


  // Default system instructions. Opens the System instructions panel, fills it, closes it. Never touches the prompt box.
  // Rule: fill when the field is empty, or when it still holds the text this script put there earlier (so editing the default replaces it).
  // Text you wrote yourself in that field is kept.
  let sysDone = false;
  const sysCard = () => document.querySelector('[data-test-system-instructions-card]');
  const sysBox = () => all('textarea').find((e) => /system instructions/i.test(label(e)) && visible(e));
  const applySystem = async (settings) => {
    const want = (settings.sys || '').trim();
    if (!settings.sysOn || !want) return { ok: true, note: 'system instructions off' };
    const card = sysCard();
    if (!card) return { ok: false, note: 'no System instructions card' };
    card.click();
    let box = null;
    for (let i = 0; i < 20 && !box; i += 1) { await sleep(250); box = sysBox(); }
    if (!box) return { ok: false, note: 'System instructions panel did not open' };
    const have = (box.value || '').trim();
    let note;
    if (have === want) note = 'system instructions already set';
    else if (!have || (settings.sysLast && have === settings.sysLast.trim())) {
      setText(box, want);
      await sleep(400);
      box.dispatchEvent(new Event('blur', { bubbles: true }));
      const ok = (box.value || '').trim() === want;
      note = ok ? 'system instructions set' : 'system instructions not accepted';
      if (!ok) return { ok: false, note };
      settings.sysLast = want;
      const cur = loadSettings(); cur.sysLast = want; saveSettings(cur);
    } else note = 'system instructions kept (field already has other text)';
    const close = all('button').find((b) => /close panel/i.test(label(b)) && visible(b));
    if (close) close.click(); else escape();
    await sleep(500);
    return { ok: true, note };
  };

  // Apply the saved defaults. Only touches the model and thinking controls, never the prompt text.
  const applyDefaults = async (settings) => {
    const notes = [];
    const result = await withSettings(async () => {
      if (settings.model && settings.model.trim()) {
        const m = await chooseModel(settings.model.trim());
        notes.push(m.note);
        if (!m.ok) return { ok: false, note: m.note };
      }
      if (settings.thinking && settings.thinking !== 'none') {
        const levels = settings.thinking === 'highest' ? null : [settings.thinking];
        const t = await chooseThinking(levels);
        notes.push(t.note);
        if (!t.ok) return { ok: false, note: t.note };
      }
      return { ok: true };
    });
    if (result.ok && !sysDone) {
      const sr = await applySystem(settings);
      notes.push(sr.note);
      if (sr.ok) sysDone = true; else return { ok: false, note: sr.note };
    }
    return { ok: result.ok, note: result.note || notes.join(' / ') };
  };

  // Settings button and card (bottom left).
  const buildSettingsUi = () => {
    if (document.getElementById('aisd-gear') || !document.body) return;
    const gear = document.createElement('button');
    gear.id = 'aisd-gear';
    gear.type = 'button';
    gear.title = 'AI Studio defaults';
    gear.textContent = '\u2699';
    gear.style.cssText = 'position:fixed;left:226px;top:62px;z-index:99998;width:34px;height:34px;border-radius:17px;border:1px solid #888;background:#222;color:#fff;font:18px sans-serif;cursor:pointer;opacity:.55';
    gear.onmouseenter = () => { gear.style.opacity = '1'; };
    gear.onmouseleave = () => { gear.style.opacity = '.55'; };
    const card = document.createElement('div');
    card.id = 'aisd-card';
    card.style.cssText = 'display:none;position:fixed;left:226px;top:104px;z-index:99999;width:290px;padding:14px;border-radius:12px;background:#222;color:#fff;font:14px sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5)';
    const make = (tag, css, content, id) => {
      const e = document.createElement(tag);
      if (css) e.style.cssText = css;
      if (content) e.textContent = content;
      if (id) e.id = id;
      return e;
    };
    card.appendChild(make('div', 'font-weight:bold;margin-bottom:8px', 'AI Studio defaults v' + VERSION));
    const onRow = make('label', 'display:block;margin-bottom:8px');
    const onBox = make('input', '', '', 'aisd-on');
    onBox.type = 'checkbox';
    onRow.appendChild(onBox);
    onRow.appendChild(document.createTextNode(' Apply on every visit and new chat'));
    card.appendChild(onRow);
    const modelRow = make('label', 'display:block;margin-bottom:8px', 'Model (name or part of its id; empty = leave as is)');
    modelRow.appendChild(document.createElement('br'));
    modelRow.appendChild(make('input', 'width:100%;box-sizing:border-box;padding:4px 6px;margin-top:4px;color:#fff;background:#3a3a3a;border:1px solid #777;border-radius:6px;font:14px sans-serif', '', 'aisd-model'));
    card.appendChild(modelRow);
    const thinkRow = make('label', 'display:block;margin-bottom:10px', 'Thinking level');
    thinkRow.appendChild(document.createElement('br'));
    const sel = make('select', 'width:100%;padding:4px 6px;margin-top:4px;color:#fff;background:#3a3a3a;border:1px solid #777;border-radius:6px;font:14px sans-serif', '', 'aisd-think');
    [['highest', 'Highest the model offers'], ['Extra High', 'Extra High'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low'], ['none', 'Leave as is']].forEach(([v, t]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      o.style.cssText = 'color:#fff;background:#3a3a3a';
      sel.appendChild(o);
    });
    thinkRow.appendChild(sel);
    card.appendChild(thinkRow);
    const sysRow = make('label', 'display:block;margin-bottom:10px');
    const sysOn = make('input', '', '', 'aisd-sys-on');
    sysOn.type = 'checkbox';
    sysRow.appendChild(sysOn);
    sysRow.appendChild(document.createTextNode(' Default system instructions (new chats; leaves text you typed yourself alone)'));
    sysRow.appendChild(make('textarea', 'width:100%;box-sizing:border-box;height:110px;padding:4px 6px;margin-top:4px;color:#fff;background:#3a3a3a;border:1px solid #777;border-radius:6px;font:12px sans-serif;resize:vertical', '', 'aisd-sys'));
    card.appendChild(sysRow);
    const save = make('button', 'padding:6px 10px;margin-right:6px;color:#fff;background:#444;border:1px solid #777;border-radius:6px;cursor:pointer;font:14px sans-serif', 'Save', 'aisd-save');
    save.type = 'button';
    const now = make('button', 'padding:6px 10px;color:#fff;background:#444;border:1px solid #777;border-radius:6px;cursor:pointer;font:14px sans-serif', 'Save and apply now', 'aisd-now');
    now.type = 'button';
    card.appendChild(save);
    card.appendChild(now);
    card.appendChild(make('div', 'margin-top:8px;font-size:12px;opacity:.85', '', 'aisd-msg'));
    card.appendChild(make('div', 'margin-top:8px;font-size:11px;opacity:.7;white-space:pre-wrap;font-family:monospace;max-height:150px;overflow:auto', '', 'aisd-log'));
    card.appendChild(make('div', 'margin-top:4px;font-size:11px;opacity:.7;font-family:monospace', '', 'aisd-state'));
    document.body.appendChild(gear);
    document.body.appendChild(card);
    const $ = (id) => card.querySelector(id);
    const fill = () => {
      const s = loadSettings();
      $('#aisd-on').checked = !!s.enabled;
      $('#aisd-model').value = s.model || '';
      $('#aisd-think').value = s.thinking || 'highest';
      $('#aisd-sys-on').checked = !!s.sysOn;
      $('#aisd-sys').value = s.sys || '';
    };
    const read = () => ({ enabled: $('#aisd-on').checked, model: $('#aisd-model').value.trim(), thinking: $('#aisd-think').value, sysOn: $('#aisd-sys-on').checked, sys: $('#aisd-sys').value, sysLast: loadSettings().sysLast || '' });
    gear.onclick = () => { fill(); $('#aisd-log').textContent = LOG.join('\n'); $('#aisd-msg').textContent = ''; card.style.display = card.style.display === 'none' ? 'block' : 'none'; };
    $('#aisd-save').onclick = () => { saveSettings(read()); $('#aisd-msg').textContent = 'Saved. Used from the next new chat.'; };
    $('#aisd-now').onclick = async () => {
      saveSettings(read());
      sysDone = false;
      $('#aisd-msg').textContent = 'Applying...';
      const r = await applyDefaults(loadSettings());
      if (r.ok) { doneFor = 'applied'; appliedModel = modelKey(); lastThinking = thinkingNow(); userTouched = false; modelTouched = false; settleUntil = Date.now() + 20000; nextVerify = Date.now() + 3000; verifyCount = 0; logEvent('apply now: ' + r.note); }
      $('#aisd-msg').textContent = (r.ok ? 'Done: ' : 'Not fully applied: ') + r.note;
    };
  };

  // Fresh visit or fresh chat (empty new-chat page): apply the defaults. Chats that already have messages are never touched.
  // AI Studio can reset the run settings without changing the page address (for example when Playground is clicked while already on a new chat),
  // so on an empty chat the settings are checked every tick and set again if they drifted, unless you changed them yourself.
  let doneFor = '';
  let appliedModel = '';
  let lastThinking = '';
  let userTouched = false; // you picked a thinking level yourself
  let modelTouched = false; // you picked a model yourself (thinking is still kept at your default)
  let lastControl = '';
  let tries = 0;
  let busy = false;
  let freshAt = 0;
  let settleUntil = 0;
  let nextVerify = 0;
  let verifyCount = 0;
  const resetState = (why) => {
    sysDone = false; doneFor = ''; appliedModel = ''; lastThinking = ''; userTouched = false; modelTouched = false; lastControl = ''; tries = 0; settleUntil = 0; verifyCount = 0; freshAt = 0;
    if (why) logEvent('fresh start: ' + why);
  };

  // Which control did you use? A model pick only pauses the model default; the thinking default is kept for the new model.
  // A pick in the Thinking level dropdown itself is the one thing left alone until the next fresh chat.
  const settingsKind = (t) => {
    if (!t || !t.closest) return '';
    if (t.closest('#aisd-card,#aisd-gear')) return '';
    const ts = thinkingSelect();
    if (ts && ts.contains(t)) return 'thinking';
    const mb = modelButton();
    if (mb && mb.contains(t)) return 'model';
    if (t.closest('mat-option') && !t.closest('.cdk-overlay-container button')) return lastControl || 'thinking';
    if (t.closest('mat-select,[role="option"],[role="listbox"],.cdk-overlay-container')) return lastControl || '';
    return '';
  };
  const noteUserPick = (kind) => {
    if (!kind) return;
    lastControl = kind;
    // A pick in the Thinking level dropdown is not an exemption: the saved thinking default (change it with the gear card) governs an empty chat.
    if (kind === 'thinking') return;
    if (!modelTouched) { logEvent('you picked a model: keeping thinking at your default for it'); modelTouched = true; }
  };
  const navTarget = (t) => {
    const e = t && t.closest ? t.closest('a,button,[role="link"],[role="button"]') : null;
    if (!e) return false;
    const label = text(e).replace(/\s+/g, ' ');
    return /new_chat/.test(e.getAttribute('href') || '') || (label.length < 40 && /\b(playground|new chat)\b/i.test(label));
  };
  const watchClicks = () => {
    document.addEventListener('pointerdown', (ev) => {
      if (busy) return;
      if (navTarget(ev.target)) { resetState('clicked ' + text(ev.target.closest('a,button,[role="link"],[role="button"]')).replace(/\s+/g, ' ').slice(0, 20)); return; }
      noteUserPick(settingsKind(ev.target));
    }, true);
    document.addEventListener('keydown', (ev) => {
      if (busy) return;
      noteUserPick(settingsKind(document.activeElement));
    }, true);
  };

  const wantedThinking = (settings) => (settings.thinking === 'highest' ? null : [settings.thinking]);
  const thinkingNow = () => { const c = thinkingSelect(); return c ? text(c).toLowerCase() : ''; };
  const modelMismatch = (settings) => {
    const want = (settings.model || '').trim().toLowerCase();
    if (!want) return false;
    const b = modelButton();
    return !!b && !modelInfo(b).includes(want);
  };

  const showState = () => {
    const box = document.getElementById('aisd-state');
    if (!box) return;
    const t = thinkingSelect();
    box.textContent = 'page: ' + location.pathname + (chatIsEmpty() ? ' (empty)' : ' (has messages)') + ' | panel: ' + (t || modelButton() ? 'open' : 'closed') + ' | thinking now: ' + (t ? text(t) : '?') + ' | state: ' + (doneFor || 'waiting') + (userTouched ? ' | your thinking choice kept' : '') + (modelTouched ? ' | your model choice kept' : '');
  };
  const applyAndRecord = async (settings, why, recheck) => {
    busy = true;
    try {
      const r = await applyDefaults(settings);
      const noControl = /no thinking level control/.test(r.note || '');
      if (noControl && Date.now() - freshAt < 15000) {
        // The page may still be drawing the settings (slow machine or just after a page change): not the same as a model without the control.
        logEvent(why + ': thinking control not there yet, will retry');
        return false;
      }
      if (r.ok || noControl) {
        doneFor = 'applied'; appliedModel = modelKey(); lastThinking = thinkingNow(); userTouched = false; modelTouched = false;
        if (!recheck) { settleUntil = Date.now() + 20000; nextVerify = Date.now() + 3000; verifyCount = 0; }
        logEvent(why + ': ' + (r.note || 'ok'));
        return true;
      }
      tries += 1;
      logEvent(why + ' failed (' + tries + '): ' + r.note);
      return false;
    } finally { busy = false; }
  };

  const tick = async () => {
    try { buildSettingsUi(); showState(); } catch (error) { /* the settings button is optional */ }
    const settings = loadSettings();
    if (!settings.enabled) return;
    if (!onNewChat() || !chatIsEmpty()) {
      if (doneFor || userTouched || modelTouched) resetState(onNewChat() ? 'chat has messages' : 'left the new chat page');
      return;
    }
    if (!freshAt) freshAt = Date.now();
    if (busy) return;
    if (doneFor === 'applied') {
      if (modelTouched) {
        // You chose another model. The model is not forced back, but thinking stays at the saved default for it,
        // including when AI Studio resets thinking a moment after the model change.
        if (settings.thinking === 'none') return;
        const key = modelKey();
        const readableNow = !!thinkingSelect();
        const modelChanged = !!key && key !== appliedModel;
        const thinkDrift = readableNow && lastThinking && thinkingNow() !== lastThinking;
        const closedCheck = !readableNow && Date.now() < settleUntil && Date.now() >= nextVerify && verifyCount < 3;
        if (!modelChanged && !thinkDrift && !closedCheck) return;
        if (closedCheck) { verifyCount += 1; nextVerify = Date.now() + 6000; }
        if (modelChanged) { settleUntil = Date.now() + 20000; nextVerify = Date.now() + 3000; verifyCount = 0; }
        busy = true;
        try {
          const r = await withSettings(() => chooseThinking(wantedThinking(settings)));
          if (r.ok || /no thinking level control/.test(r.note || '')) { appliedModel = modelKey(); lastThinking = thinkingNow(); }
          logEvent((modelChanged ? 'model changed by you' : thinkDrift ? 'AI Studio changed thinking' : 'recheck') + ': thinking set again (' + (r.note || 'ok') + ')');
        } finally { busy = false; }
        return;
      }
      // Not touched by you: if AI Studio reset the model or thinking level, set them again.
      const readable = !!thinkingSelect();
      const lateControl = settings.thinking !== 'none' && readable && !lastThinking; // the control showed up after we gave up on it
      const drifted = modelMismatch(settings) || lateControl || (settings.thinking !== 'none' && readable && lastThinking && thinkingNow() !== lastThinking);
      if (drifted) {
        logEvent(lateControl ? 'thinking control appeared late: setting it' : 'AI Studio changed it to "' + thinkingNow() + '": setting it again');
        doneFor = '';
        tries = 0;
        freshAt = Date.now();
      } else if (!readable && Date.now() < settleUntil && Date.now() >= nextVerify && verifyCount < 3) {
        // The settings panel is closed (narrow window), so the value cannot be read. Check again a few times just after a fresh chat,
        // because AI Studio sets its own defaults a moment after the page changes.
        verifyCount += 1;
        nextVerify = Date.now() + (verifyCount === 1 ? 5000 : 7000);
        await applyAndRecord(settings, 'recheck ' + verifyCount, true);
        return;
      } else {
        return;
      }
    }
    if (tries >= 6) return;
    await applyAndRecord(settings, 'apply');
  };

  const start = () => { watchClicks(); setInterval(() => tick().catch((e) => { window.__aisdErr = String(e && e.stack || e); }), 700); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
