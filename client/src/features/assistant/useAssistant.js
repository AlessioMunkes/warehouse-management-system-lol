// ─────────────────────────────────────────────────────────────
// client/src/features/assistant/useAssistant.js
//
// The conversation state behind the help panel.
//
// A "conversation" here is mostly a transcript the USER can read back.
// The server is given the question, the screen, and the last three
// questions with the topic each was answered with (HISTORY), so "and
// then?" or "that's not what I meant" is read as part of the same
// conversation. No more than that: a help answer that depends on what
// was asked ten turns ago is one nobody can predict or test.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAssistantCatalog, fetchTopic, askAssistant,
} from '../../services/assistantAPI';

const HISTORY = 3;

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

  // The last few things asked and the topic each was answered with.
  // Sent with the next question so the assistant can tell a reply from
  // a new one.
  const turns = useRef([]);

  const ask = useCallback(async (question) => {
    const text = question.trim();
    if (!text || busy) return;

    push({ from: 'user', text });
    setBusy(true);
    try {
      const sent = turns.current;
      const res = await askAssistant(text, screen ?? undefined, sent.length ? sent : null);
      // A turn not answered with a topic keeps the subject of the one before.
      const topicId = res.type === 'topic' ? res.topic?.id : sent[sent.length - 1]?.topicId;
      turns.current = [...sent, { question: text, topicId }].slice(-HISTORY);
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

  const clear = useCallback(() => { turns.current = []; setEntries([]); }, []);

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
