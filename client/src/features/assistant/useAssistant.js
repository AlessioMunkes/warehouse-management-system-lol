// ─────────────────────────────────────────────────────────────
// client/src/features/assistant/useAssistant.js
//
// The conversation state behind the help panel.
//
// A "conversation" here is a transcript the USER can read back, not
// a context the model sees. Every question is answered on its own —
// the server is given the question and the screen, nothing else.
// That is deliberate: a help answer that depends on what was asked
// four turns ago is a help answer nobody can predict or test, and
// it would put earlier questions into every later prompt.
//
// So this holds a list of things that have been said, and each new
// question starts clean.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAssistantCatalog, fetchTopic, askAssistant,
} from '../../services/assistantAPI';

let nextId = 0;
const withId = (entry) => ({ ...entry, key: `m${nextId++}` });

export default function useAssistant({ open, screen, onNavigate }) {
  const [catalog, setCatalog]   = useState(null);
  const [entries, setEntries]   = useState([]);
  const [busy, setBusy]         = useState(false);

  // One fetch per session, on first open rather than on mount: the
  // launcher is on every authenticated screen, and a catalog request
  // per page load would be a request per page load for a panel most
  // people will not open.
  const loaded = useRef(false);
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    fetchAssistantCatalog()
      .then(setCatalog)
      // A failed catalog is not worth an error message: the panel
      // still takes questions, it just opens without chips.
      .catch(() => setCatalog({ enabled: true, suggestions: {} }));
  }, [open]);

  const push = useCallback((entry) => {
    setEntries((prev) => [...prev, withId(entry)]);
  }, []);

  /** Show a topic without spending a model call — chips and links. */
  const openTopic = useCallback(async (id, label) => {
    if (label) push({ from: 'user', text: label });
    setBusy(true);
    try {
      const res = await fetchTopic(id);
      push({ from: 'assistant', kind: 'topic', topic: res.topic });
    } catch (err) {
      push({ from: 'assistant', kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }, [push]);

  const ask = useCallback(async (question) => {
    const text = question.trim();
    if (!text || busy) return;

    push({ from: 'user', text });
    setBusy(true);
    try {
      const res = await askAssistant(text, screen ?? undefined);
      push({ from: 'assistant', kind: res.type, ...res });
      // "Take me to inventory" should take them to inventory. The
      // server has already checked the screen against their role —
      // see the three gates in assistant.service.js — and the client
      // resolves the id to a path, so an id this build has no route
      // for simply does nothing.
      if (res.type === 'navigate' && res.screen) onNavigate?.(res.screen);
    } catch (err) {
      // The server writes these for the reader — "busy right now",
      // "type a few more words" — so they are shown as the answer
      // rather than as a banner somewhere else.
      push({
        from: 'assistant',
        kind: 'error',
        text: err.isNetworkError
          ? 'I cannot reach the server right now. The suggestions above still work once you are back online.'
          : err.message,
      });
    } finally {
      setBusy(false);
    }
  }, [busy, push, screen, onNavigate]);

  const clear = useCallback(() => setEntries([]), []);

  // The chips for the screen they are on, falling back to the
  // general ones so the panel is never blank.
  const suggestions =
    catalog?.suggestions?.[screen] ?? catalog?.suggestions?.home ?? [];

  return {
    catalog,
    entries,
    busy,
    suggestions,
    enabled: catalog ? catalog.enabled !== false : true,
    ask,
    openTopic,
    clear,
  };
}
