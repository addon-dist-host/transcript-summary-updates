// ==UserScript==
// @name         DesVoice to AI Studio
// @namespace    com.des.desvoice
// @version      0.3
// @description  Sets the highest thinking level on every fresh AI Studio chat, and runs prompts DesVoice puts in the link (#dv=...). Works with the phone layout.
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

  const chooseModel = async (model) => {
    const wanted = model.toLowerCase();
    const button = modelButton();
    if (!button) return { ok: false, note: 'no model control found' };
    if (modelInfo(button).includes(wanted)) return { ok: true, note: 'model already ' + model };
    button.click();
    await sleep(900);
    const search = all('input').find((e) => /search|filter|find/.test(label(e)));
    if (search) {
      setText(search, model);
      await sleep(900);
    }
    const hit = await until(() => all('.cdk-overlay-container button,.cdk-overlay-container [role="option"],.cdk-overlay-container mat-option,.cdk-overlay-container [role="menuitem"],.cdk-overlay-container [role="radio"],.cdk-overlay-container li')
      .filter((e) => text(e).length < 900 && (' ' + text(e).toLowerCase() + ' ').includes(wanted))
      .sort((x, y) => text(x).length - text(y).length)[0], 4000);
    if (!hit) {
      escape();
      return { ok: false, note: model + ' not listed' };
    }
    hit.click();
    await sleep(1200);
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
  const onNewChat = () => /^\/prompts\/new_chat/.test(location.pathname);

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
  let lastApplied = '';
  let wasEmpty = false;
  let attempts = 0;
  const autoMax = async () => {
    if (!onNewChat() || !chatIsEmpty()) { wasEmpty = false; return; }
    const key = location.pathname + '|' + modelKey();
    const freshChat = !wasEmpty;
    wasEmpty = true;
    if (!freshChat && key === lastApplied) return;
    if (!freshChat && !modelKey()) return;
    lastApplied = key;
    const result = await withSettings(() => chooseThinking(null));
    if (result.ok) {
      attempts = 0;
      lastApplied = location.pathname + '|' + modelKey();
    } else {
      attempts += 1;
      if (attempts < 6) wasEmpty = false; // page may still be loading: try again on the next tick
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
