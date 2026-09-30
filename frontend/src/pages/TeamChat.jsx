import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, MoreVertical, Send, Trash2, UsersRound } from "lucide-react";
import api from "../services/api.js";

const ROLE_LABELS = {
  superadmin: "Barangay Captain",
  admin: "Barangay Official",
};

function readCurrentUserId() {
  try {
    return Number(JSON.parse(localStorage.getItem("barangay199_user") || "null")?.id) || null;
  } catch {
    return null;
  }
}

function messageAuthor(message) {
  return [message.first_name, message.middle_initial, message.last_name].filter(Boolean).join(" ") || "Barangay user";
}

function formatMessageTime(value) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TeamChat() {
  const location = useLocation();
  const [mode, setMode] = useState(() => location.state?.chatMode === "private" ? "private" : "team");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [recipients, setRecipients] = useState([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState(() => String(location.state?.recipientId || ""));
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [clearingConversation, setClearingConversation] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lastMessageIdRef = useRef(0);
  const loadingMessagesRef = useRef(false);
  const messageListRef = useRef(null);
  const chatMenuRef = useRef(null);
  const currentUserId = readCurrentUserId();

  useEffect(() => {
    if (location.state?.chatMode !== "private") return;
    setMode("private");
    setSelectedRecipientId(String(location.state.recipientId || ""));
  }, [location.key]);

  useEffect(() => {
    if (!chatMenuOpen) return undefined;
    const closeMenu = (event) => {
      if (!chatMenuRef.current?.contains(event.target)) setChatMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setChatMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [chatMenuOpen]);

  useEffect(() => {
    let active = true;
    api.get("/team-chat/users")
      .then(({ data }) => {
        if (active) setRecipients(data.users || []);
      })
      .catch((requestError) => {
        if (active) setError(requestError?.response?.data?.message || "Could not load chat recipients.");
      })
      .finally(() => {
        if (active) setLoadingRecipients(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    lastMessageIdRef.current = 0;
    loadingMessagesRef.current = false;
    setMessages([]);
    setLoading(true);

    const loadMessages = async () => {
      if (!active || loadingMessagesRef.current) return;
      if (mode === "private" && !selectedRecipientId) {
        setLoading(false);
        return;
      }
      loadingMessagesRef.current = true;
      const isInitialLoad = lastMessageIdRef.current === 0;
      const list = messageListRef.current;
      const wasAtBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;

      try {
        const endpoint = mode === "team"
          ? "/team-chat/messages"
          : `/team-chat/private/${selectedRecipientId}/messages`;
        const { data } = await api.get(endpoint);
        if (!active) return;
        const incoming = data.messages || [];

        if (incoming.length) {
          lastMessageIdRef.current = Math.max(lastMessageIdRef.current, ...incoming.map((item) => Number(item.id)));
          setMessages(incoming.slice(-100));
          if (isInitialLoad || wasAtBottom) {
            window.requestAnimationFrame(() => {
              const currentList = messageListRef.current;
              currentList?.scrollTo({ top: currentList.scrollHeight, behavior: "smooth" });
            });
          }
        } else if (isInitialLoad) {
          setMessages([]);
        }
        setError("");
      } catch (requestError) {
        if (active) setError(requestError?.response?.data?.message || "Could not load team chat messages.");
      } finally {
        if (active) setLoading(false);
        loadingMessagesRef.current = false;
      }
    };

    loadMessages();
    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") loadMessages();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, [mode, selectedRecipientId]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError("");
    try {
      const endpoint = mode === "team"
        ? "/team-chat/messages"
        : `/team-chat/private/${selectedRecipientId}/messages`;
      const { data } = await api.post(endpoint, { message: text });
      const newMessage = data.message;
      lastMessageIdRef.current = Math.max(lastMessageIdRef.current, Number(newMessage.id));
      setMessages((current) => (
        current.some((item) => Number(item.id) === Number(newMessage.id))
          ? current
          : [...current, newMessage].slice(-100)
      ));
      setDraft("");
      window.requestAnimationFrame(() => {
        const list = messageListRef.current;
        list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not send your message.");
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (message) => {
    if (message.deleted_at || !window.confirm("Delete this message for everyone in the conversation?")) return;

    setError("");
    const endpoint = mode === "team"
      ? `/team-chat/messages/${message.id}`
      : `/team-chat/private/messages/${message.id}`;
    try {
      await api.delete(endpoint);
      setMessages((current) => current.map((item) => (
        Number(item.id) === Number(message.id)
          ? { ...item, deleted_at: new Date().toISOString() }
          : item
      )));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not delete the message.");
    }
  };

  const deleteConversationForMe = async () => {
    if (!selectedRecipientId || !messages.length || clearingConversation) return;
    if (!window.confirm("Are you sure you want to delete the conversation? The other person will keep their copy.")) return;

    setClearingConversation(true);
    setError("");
    setNotice("");
    try {
      await api.delete(`/team-chat/private/${selectedRecipientId}/conversation`);
      setSelectedRecipientId("");
      setNotice("Conversation removed from your inbox.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not delete this conversation from your inbox.");
    } finally {
      setClearingConversation(false);
    }
  };

  const deleteTeamConversationForMe = async () => {
    if (clearingConversation || !window.confirm("Are you sure you want to delete the conversation?")) return;

    setClearingConversation(true);
    setError("");
    setNotice("");
    try {
      await api.delete("/team-chat/conversation");
      setMessages([]);
      lastMessageIdRef.current = 0;
      setNotice("Team conversation removed from your view.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not delete the team conversation from your view.");
    } finally {
      setClearingConversation(false);
    }
  };

  const deleteActiveConversation = () => {
    setChatMenuOpen(false);
    if (mode === "team") return deleteTeamConversationForMe();
    return deleteConversationForMe();
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-150px)] max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-3 border-b border-ink/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Workspace</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink900">Messages</h2>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-muted">
          <UsersRound size={17} />
          <span>Barangay captain and officials</span>
        </div>
      </header>
      {notice && <p role="status" className="rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{notice}</p>}

      <div role="tablist" aria-label="Message type" className="flex gap-5 border-b border-ink/10">
        {[["team", "Team Chat"], ["private", "Private Messages"]].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => { setMode(value); setError(""); }}
            className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${mode === value ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink900"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="flex min-h-[min(620px,calc(100vh-250px))] flex-1 flex-col overflow-hidden rounded-xl2 border border-ink/10 bg-white shadow-card">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/10 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark">
              <MessageCircle size={19} />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink900">{mode === "team" ? "Care Team" : "Private Conversation"}</h3>
              <p className="text-xs text-muted">
                {mode === "team" ? "Shared conversation" : "Only you and the selected person can read these messages"}
              </p>
            </div>
          </div>
          {(mode === "team" || (selectedRecipientId && messages.length > 0)) && (
            <div ref={chatMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setChatMenuOpen((open) => !open)}
                aria-label="Chat options"
                aria-haspopup="menu"
                aria-expanded={chatMenuOpen}
                title="Chat options"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink900"
              >
                <MoreVertical size={19} />
              </button>
              {chatMenuOpen && (
                <div role="menu" className="absolute right-0 top-full z-20 mt-2 min-w-48 overflow-hidden rounded-lg border border-ink/10 bg-white py-1 shadow-card">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={deleteActiveConversation}
                    disabled={clearingConversation}
                    className="flex min-h-10 w-full items-center gap-2.5 px-3 text-left text-sm font-medium text-risk transition-colors hover:bg-risk-light disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    Delete conversation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {mode === "private" && (
          <div className="shrink-0 border-b border-ink/10 px-4 py-3 sm:px-5">
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-semibold text-muted sm:flex-row sm:items-center sm:gap-3">
                <span>To</span>
                <select
                  value={selectedRecipientId}
                  onChange={(event) => { setSelectedRecipientId(event.target.value); setNotice(""); }}
                  disabled={loadingRecipients}
                  className="min-h-10 min-w-0 flex-1 rounded-lg border border-ink/10 bg-white px-3 text-sm font-normal text-ink900 outline-none focus:border-primary"
                >
                  <option value="">{loadingRecipients ? "Loading people..." : "Choose a person"}</option>
                  {recipients.map((person) => (
                    <option key={person.id} value={person.id}>
                      {[person.first_name, person.middle_initial, person.last_name].filter(Boolean).join(" ")} · {ROLE_LABELS[person.role] || person.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        <div ref={messageListRef} aria-live="polite" aria-relevant="additions text" className="flex-1 space-y-4 overflow-y-auto bg-[#f7f8f6] px-4 py-5 sm:px-6">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted">Loading messages...</p>
          ) : mode === "private" && !selectedRecipientId ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <MessageCircle size={25} className="text-muted/60" />
              <p className="mt-3 text-sm font-semibold text-ink900">Choose a person</p>
              <p className="mt-1 text-sm text-muted">Select someone above to open a private conversation.</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <MessageCircle size={25} className="text-muted/60" />
              <p className="mt-3 text-sm font-semibold text-ink900">No messages yet</p>
              <p className="mt-1 text-sm text-muted">{mode === "team" ? "Start a conversation with the care team." : "Send a private message to start this conversation."}</p>
            </div>
          ) : messages.map((message) => {
            const isOwnMessage = Number(message.sender_id) === currentUserId;
            const author = messageAuthor(message);

            return (
              <article key={message.id} className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] sm:max-w-[75%] ${isOwnMessage ? "items-end" : "items-start"} flex flex-col`}>
                  <div className={`mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs ${isOwnMessage ? "justify-end" : ""}`}>
                    <span className="font-semibold text-ink900">{isOwnMessage ? "You" : author}</span>
                    {!isOwnMessage && <span className="text-muted">{ROLE_LABELS[message.role] || message.role}</span>}
                    <time className="text-muted" dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
                  </div>
                  {message.deleted_at ? (
                    <p className="rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-sm italic text-muted">Message deleted</p>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className={`whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${isOwnMessage ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm border border-ink/10 bg-white text-ink900"}`}>
                        {message.message}
                      </p>
                      {isOwnMessage && (
                        <button
                          type="button"
                          onClick={() => deleteMessage(message)}
                          aria-label="Delete message for everyone"
                          title="Delete message"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-risk-light hover:text-risk"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {error && <p role="alert" className="mx-auto max-w-lg rounded-lg border border-risk/20 bg-risk-light px-3 py-2 text-center text-sm text-risk">{error}</p>}
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); sendMessage(); }}
          className="flex shrink-0 items-end gap-2 border-t border-ink/10 bg-white p-3 sm:gap-3 sm:p-4"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                sendMessage();
              }
            }}
            maxLength={2000}
            rows={1}
            disabled={mode === "private" && !selectedRecipientId}
            aria-label="Message the care team"
            placeholder={mode === "private" && !selectedRecipientId ? "Choose a person to message" : "Write a message..."}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-lg border border-ink/10 bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-primary disabled:cursor-not-allowed disabled:bg-surface/70"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim() || (mode === "private" && !selectedRecipientId)}
            aria-label="Send message"
            title="Send message"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-muted/40"
          >
            <Send size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}