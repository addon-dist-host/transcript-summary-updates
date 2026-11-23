// ==UserScript==
// @name         DesVoice to AI Studio
// @namespace    com.des.desvoice
// @version      0.6
// @description  Sets the highest thinking level and your default system instructions on every fresh AI Studio chat, puts the cursor in the prompt box, and runs prompts DesVoice puts in the link (#dv=...). Works with the phone layout.
// @match        https://aistudio.google.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const KEY = 'desvoice-request';

  // 1. Pick up a request from the link (#dv=<url-encoded JSON>) and keep it for this tab.
  const hash = location.hash || '';
  if (hash.startsWith('#dv=')) {
    try {
      sessionStorage.setItem(KEY, decodeURIComponent(hash.slice(4)));
    } catch (error) {
      console.warn('DesVoice: could not read the link', error);
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
  let request = null;
  const saved = sessionStorage.getItem(KEY);
  if (saved) {
    try {
      request = JSON.parse(saved);
    } catch (error) {
      sessionStorage.removeItem(KEY);
    }
  }

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

  // 3. A prompt from DesVoice: set model and thinking, type the prompt, press Run only if everything worked.
  const runRequest = async () => {
    const box = await until(editor, 30000);
    if (!box) return toast('the prompt box never appeared. Nothing was sent. Reload this page to try again.');
    sessionStorage.removeItem(KEY);
    await sleep(1200);
    const notes = [];
    let allOk = true;
    const settings = await withSettings(async () => {
      if (request.m) {
        const m = await chooseModel(request.m);
        notes.push(m.note);
        if (!m.ok) allOk = false;
      }
      if (allOk) {
        const levels = Array.isArray(request.t) && request.t.length ? request.t : null;
        const t = await chooseThinking(levels);
        notes.push(t.note);
        if (!t.ok) allOk = false;
      }
      return { ok: allOk };
    });
    if (!settings.ok && settings.note) notes.push(settings.note);
    setText(editor() || box, request.p || '');
    await sleep(600);
    if (!allOk || !settings.ok) return toast('prompt typed but NOT run. ' + notes.join(' · ') + '. Fix the settings and press Run yourself.');
    if (request.run === false) return toast('prompt typed, not run (run:false). ' + notes.join(' · '));
    const runButton = await until(() => clickables().find((e) => !/\bstop\b/.test(label(e)) && (/^run\b|\brun\b.*(ctrl|enter)|submit|send/.test(label(e)) || /^run\b/i.test(text(e))) && !/settings|toggle/.test(label(e)) && !e.disabled && e.getAttribute('aria-disabled') !== 'true'), 5000);
    if (runButton) {
      runButton.click();
      toast(notes.join(' · ') + ' · sent');
    } else {
      toast('prompt typed, press Run yourself. ' + notes.join(' · '));
    }
  };

  // 4. Every fresh chat: highest thinking level for whichever model is selected.
  // AI Studio can reset the thinking level a moment after the page loads or the model changes. The settings panel is closed on a phone,
  // so the script never opens it on a timer: it sets the level once when the page is fresh and once when the model changes (the address
  // shows the model as ?model=..., visible with the panel closed). It tries again only if that failed, and reacts at once if the panel
  // happens to be open and shows a different level. Limitation: a site reset that comes later, with the panel closed and no address
  // change, cannot be seen without opening the panel, so it is not corrected. Nothing is opened while a prompt has text in it or a
  // text box has focus. Chats with messages are never touched.
  let lastApplied = '';
  let wasEmpty = false;
  let attempts = 0;
  let lastThinking = '';
  let pendingKey = '';
  let pendingTicks = 0;
  const modelFromAddress = () => (new URLSearchParams(location.search).get('model') || '').toLowerCase();
  // A text box the page focuses by itself must not block the apply forever, so a focused empty box only counts while keys are being pressed.
  let lastKey = 0;
  ['keydown', 'input', 'compositionstart'].forEach((n) => document.addEventListener(n, () => { lastKey = Date.now(); }, true));
  const promptBusy = () => {
    const a = document.activeElement;
    if (a && (/^(textarea|input)$/i.test(a.tagName) || a.isContentEditable) && Date.now() - lastKey < 8000) return true; // typing in an empty box
    return Array.from(document.querySelectorAll('textarea,[contenteditable="true"]')).some((e) => ((e.value !== undefined ? e.value : e.textContent) || '').trim().length > 0);
  };

  // Default system instructions (gear button, bottom left). Fill when the field is empty or still holds the text this script put there; text you wrote yourself is kept.
  const STORE = 'desvoice-defaults';
  const loadSys = () => { try { return Object.assign({ sysOn: false, sys: '', sysLast: '' }, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (error) { return { sysOn: false, sys: '', sysLast: '' }; } };
  const saveSys = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (error) { /* ignore */ } };
  const sysCard = () => document.querySelector('[data-test-system-instructions-card]');
  const sysBox = () => all('textarea').find((e) => /system instructions/.test(label(e)));
  const applySystem = async () => {
    const cfg = loadSys();
    const want = (cfg.sys || '').trim();
    if (!cfg.sysOn || !want) return { ok: true, note: 'system instructions off' };
    const card = sysCard();
    if (!card) return { ok: false, note: 'no System instructions card' };
    card.click();
    const box = await until(sysBox, 5000);
    if (!box) return { ok: false, note: 'System instructions panel did not open' };
    const have = (box.value || '').trim();
    let note = 'system instructions kept (field already has other text)';
    if (have === want) note = 'system instructions already set';
    else if (!have || (cfg.sysLast && have === cfg.sysLast.trim())) {
      setText(box, want);
      await sleep(400);
      box.dispatchEvent(new Event('blur', { bubbles: true }));
      if ((box.value || '').trim() !== want) return { ok: false, note: 'system instructions not accepted' };
      const cur = loadSys(); cur.sysLast = want; saveSys(cur);
      note = 'system instructions set';
    }
    const close = clickables().find((b) => /close panel/.test(label(b)) || /^close$/.test(text(b)));
    if (close) close.click(); else escape();
    await sleep(500);
    return { ok: true, note };
  };
  const buildGear = () => {
    if (document.getElementById('dvs-gear') || !document.body) return;
    const mk = (tag, css, content, id) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (content) e.textContent = content; if (id) e.id = id; return e; };
    const gear = mk('button', 'position:fixed;left:8px;bottom:150px;z-index:99998;width:34px;height:34px;border-radius:17px;border:1px solid #888;background:#222;color:#fff;font:18px sans-serif;opacity:.6', '\u2699', 'dvs-gear');
    gear.type = 'button';
    gear.title = 'Default system instructions';
    const card = mk('div', 'display:none;position:fixed;left:8px;right:8px;bottom:190px;z-index:99999;padding:12px;border-radius:12px;background:#222;color:#fff;font:14px sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5)', '', 'dvs-card');
    card.appendChild(mk('div', 'font-weight:bold;margin-bottom:8px', 'DesVoice defaults v0.6'));
    const row = mk('label', 'display:block;margin-bottom:8px');
    const on = mk('input', '', '', 'dvs-on');
    on.type = 'checkbox';
    row.appendChild(on);
    row.appendChild(document.createTextNode(' Default system instructions on new chats (text you typed yourself is kept)'));
    card.appendChild(row);
    const ta = mk('textarea', 'width:100%;box-sizing:border-box;height:120px;padding:6px;color:#fff;background:#3a3a3a;border:1px solid #777;border-radius:6px;font:12px sans-serif;resize:vertical', '', 'dvs-text');
    card.appendChild(ta);
    const save = mk('button', 'margin-top:8px;padding:8px 12px;color:#fff;background:#444;border:1px solid #777;border-radius:6px;font:14px sans-serif', 'Save', 'dvs-save');
    save.type = 'button';
    card.appendChild(save);
    card.appendChild(mk('span', 'margin-left:8px;font-size:12px', '', 'dvs-msg'));
    document.body.appendChild(gear);
    document.body.appendChild(card);
    gear.onclick = () => { const c = loadSys(); on.checked = !!c.sysOn; ta.value = c.sys || ''; card.style.display = card.style.display === 'none' ? 'block' : 'none'; };
    save.onclick = () => { const c = loadSys(); c.sysOn = on.checked; c.sys = ta.value; saveSys(c); card.querySelector('#dvs-msg').textContent = 'Saved. Used from the next new chat.'; };
  };
  // Put the cursor in the prompt box once, after the defaults are applied, only if nothing is typed and nothing is focused yet.
  const focusPrompt = () => {
    const box = editor();
    if (!box || promptBusy()) return false;
    const a = document.activeElement;
    if (a && a !== document.body && a !== box && (/^(textarea|input)$/i.test(a.tagName) || a.isContentEditable)) return false;
    box.focus();
    return document.activeElement === box;
  };
  const autoMax = async () => {
    try { buildGear(); } catch (error) { /* optional */ }
    if (!onNewChat() || !chatIsEmpty()) { wasEmpty = false; lastThinking = ''; lastApplied = ''; pendingKey = ''; return; }
    const key = location.pathname + '|' + modelFromAddress();
    const freshChat = !wasEmpty;
    wasEmpty = true;
    const control = thinkingSelect();
    let why = '';
    if (freshChat || key !== lastApplied) {
      // Let the page settle for two ticks after a change so AI Studio's own reset comes first, then set the level once.
      if (key !== pendingKey) { pendingKey = key; pendingTicks = 0; }
      pendingTicks += 1;
      if (pendingTicks < 2 || promptBusy()) { if (freshChat) wasEmpty = false; return; }
      why = 'apply';
    } else if (control && lastThinking && text(control).toLowerCase() !== lastThinking && !promptBusy()) {
      why = 'recheck';
    } else {
      return;
    }
    let seen = '';
    const result = await withSettings(async () => { const r = await chooseThinking(null); if (r.ok || /no thinking level control/.test(r.note || '')) { const sr = await applySystem(); if (!sr.ok) return { ok: false, note: sr.note }; } const c = thinkingSelect(); if (c) seen = text(c).toLowerCase(); return r; });
    if (result.ok) {
      attempts = 0;
      lastApplied = key;
      if (seen) lastThinking = seen;
      if (why === 'apply') { await sleep(400); focusPrompt(); }
    } else {
      attempts += 1;
      if (why === 'apply' && attempts < 6) { wasEmpty = false; pendingKey = ''; } // failed: try again on a later tick
      else if (why === 'apply') lastApplied = key;
      if (result.note && !/no thinking level control/.test(result.note)) console.warn('DesVoice:', result.note);
    }
  };

  const start = async () => {
    if (request) {
      await runRequest();
      request = null;
    }
    let busy = false;
    setInterval(async () => {
      if (busy || sessionStorage.getItem(KEY)) return;
      busy = true;
      try { await autoMax(); } finally { busy = false; }
    }, 1500);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
