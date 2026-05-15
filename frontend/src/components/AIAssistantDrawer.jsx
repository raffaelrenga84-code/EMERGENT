import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, X } from 'lucide-react';
import { aiClient } from '../lib/aiClient.js';
import { useT } from '../lib/i18n.jsx';

/**
 * AIAssistantDrawer — Floating chat assistant for FAMMY.
 *
 * Layout: small FAB in the bottom-right (above the bottom-nav). Tapping it
 * opens a bottom-sheet conversational interface.
 *
 * The component is fully self-contained: it owns the session id (so the chat
 * persists across reopens within the page lifetime) and only needs minimal
 * context from the parent (user id + a snapshot of the family state used to
 * personalize the assistant's answers).
 */
export default function AIAssistantDrawer({ session, families = [], members = [], tasks = [], events = [], activeFamily }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]); // [{role, content}]
  const [sessionId, setSessionId] = useState(null);
  const [thinking, setThinking] = useState(false);
  const scrollerRef = useRef(null);
  const textareaRef = useRef(null);

  const userId = session?.user?.id || 'anonymous';

  // The current family (or all)
  const currentFamily = (() => {
    if (!activeFamily || activeFamily === 'all') return null;
    return families.find((f) => f.id === activeFamily) || null;
  })();

  const buildFamilyContext = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

    const memberNames = members.map((m) => m.name).filter(Boolean);
    const openTasks = tasks
      .filter((t) => t.status !== 'done')
      .slice(0, 10)
      .map((t) => t.title);
    const upcoming = (events || [])
      .filter((ev) => {
        const d = new Date(ev.starts_at);
        return d >= today && d <= weekEnd;
      })
      .slice(0, 8)
      .map((ev) => {
        const d = new Date(ev.starts_at);
        return `${ev.title} — ${d.toLocaleDateString(lang, { day: 'numeric', month: 'short' })}`;
      });

    return {
      family_name: currentFamily?.name || (lang === 'it' ? 'la famiglia' : 'the family'),
      members: memberNames,
      today_tasks: openTasks,
      upcoming_events: upcoming,
    };
  };

  const send = async (textOverride) => {
    const text = (textOverride !== undefined ? textOverride : input).trim();
    if (!text || thinking) return;
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setThinking(true);
    try {
      const res = await aiClient.chat({
        message: text,
        user_id: userId,
        family_context: buildFamilyContext(),
        lang,
        session_id: sessionId,
      });
      setSessionId(res.session_id);
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${e.message}` }]);
    } finally {
      setThinking(false);
      // refocus input for fast follow-up
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  // Reset chat session whenever the user changes language so the new
  // conversation starts in the chosen language (and we don't continue a
  // multi-turn that was started in another language).
  useEffect(() => {
    setMessages([]);
    setSessionId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    if (!open) return;
    // Greet on first open
    if (messages.length === 0) {
      const hello = currentFamily
        ? t('ai_greet_with_family').replace('{name}', currentFamily.name)
        : t('ai_greet_no_family');
      setMessages([{ role: 'assistant', content: hello }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lang]);

  useEffect(() => {
    // auto-scroll to bottom on new messages
    const sc = scrollerRef.current;
    if (sc) sc.scrollTop = sc.scrollHeight;
  }, [messages, thinking]);

  const SUGGESTIONS = [
    t('ai_sugg_today'),
    t('ai_sugg_summary'),
    t('ai_sugg_menu'),
    t('ai_sugg_birthday'),
  ];

  return (
    <>
      <button
        className="fab ai-fab"
        onClick={() => setOpen(true)}
        title={t('ai_assistant_title')}
        data-testid="ai-assistant-fab"
      >
        <Sparkles size={22} />
      </button>

      {open && (
        <div className="ai-drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }} data-testid="ai-assistant-drawer">
          <div className="ai-drawer">
            <div className="ai-drawer-grip" />
            <div className="ai-drawer-header">
              <div className="ai-drawer-avatar"><Sparkles size={22} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ai-drawer-title">FAMMY AI</div>
                <div className="ai-drawer-sub">{t('ai_assistant_subtitle')}</div>
              </div>
              <button className="ai-drawer-close" onClick={() => setOpen(false)} data-testid="ai-assistant-close" title={t('close')}>
                <X size={18} />
              </button>
            </div>

            <div className="ai-drawer-messages" ref={scrollerRef}>
              {messages.map((m, i) => (
                <div key={i} className={`ai-msg ${m.role}`} data-testid={`ai-msg-${m.role}-${i}`}>
                  {m.content}
                </div>
              ))}
              {thinking && (
                <div className="ai-msg assistant thinking">{t('ai_thinking')}</div>
              )}
            </div>

            {messages.length <= 1 && !thinking && (
              <div className="ai-suggestion-chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="ai-suggestion-chip"
                    onClick={() => send(s)} data-testid={`ai-suggestion-${s.length}`}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form
              className="ai-drawer-input"
              onSubmit={(e) => { e.preventDefault(); send(); }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); send();
                  }
                }}
                placeholder={t('ai_input_ph')}
                rows={1}
                data-testid="ai-input"
              />
              <button
                type="submit"
                className="ai-drawer-send"
                disabled={!input.trim() || thinking}
                data-testid="ai-send-button"
                title={t('send')}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
