import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, MessageCircle, Trash2, X } from "lucide-react";
import api from "../services/api.js";

export default function SupportChatbot() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messageListRef = useRef(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, error]);

  const sendMessage = async (value = message) => {
    const text = value.trim();
    if (!text || sending) return;
    const typingStartedAt = Date.now();
    setMessages((current) => [...current, { from: "user", text }]);
    setMessage("");
    setError("");
    setSending(true);
    try {
      const { data } = await api.post("/assistant/chat", { message: text });
      const typingRemaining = Math.max(0, 650 - (Date.now() - typingStartedAt));
      if (typingRemaining) await new Promise((resolve) => window.setTimeout(resolve, typingRemaining));
      setMessages((current) => [...current, { from: "bot", text: data.reply, source: data.source }]);
    } catch (err) {
      setError(err?.response?.data?.message || "Hindi makakonekta sa AI assistant. Subukan muli.");
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    if (sending) return;
    setMessages([]);
    setError("");
    setMessage("");
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <section aria-label="Barangay 199 assistant" className="mb-3 flex h-[min(600px,calc(100dvh-104px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-[#d8e2dd] bg-white shadow-[0_18px_54px_rgba(25,43,38,0.22)]">
          <header className="flex shrink-0 items-center justify-between bg-[#245747] px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/12"><Bot size={20} strokeWidth={1.8} /></span>
              <div className="min-w-0">
                <h2 className="truncate font-display text-sm font-semibold">Barangay 199 Assistant</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/75"><span className="h-1.5 w-1.5 rounded-full bg-[#8fe0b6]" />Local Q&amp;A library</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={clearChat} disabled={sending || messages.length === 0} aria-label="I-clear ang chat" title="I-clear ang chat" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/75 transition-colors hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><Trash2 size={16} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Isara ang chatbot" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/12 hover:text-white"><X size={18} /></button>
            </div>
          </header>
          <div ref={messageListRef} aria-live="polite" aria-relevant="additions text" className="flex-1 space-y-4 overflow-y-auto bg-[#f4f7f5] px-4 py-4">
            {messages.map((item, index) => (
              <div key={`${item.from}-${index}`} className={`flex items-end gap-2.5 ${item.from === "user" ? "justify-end" : "justify-start"}`}>
                {item.from === "bot" && <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#e4eee9] text-[#356b56]"><Bot size={15} /></span>}
                <div className={`max-w-[84%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-[13px] leading-[1.6] ${item.from === "user" ? "rounded-br-sm bg-[#285f50] text-white" : "rounded-bl-sm border border-[#e2e9e5] bg-white text-[#34413b] shadow-[0_1px_2px_rgba(21,42,32,0.04)]"}`}>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div role="status" aria-label="Sumasagot ang Barangay 199 Assistant" className="flex items-end gap-2.5">
                <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#e4eee9] text-[#356b56]"><Bot size={15} /></span>
                <div className="flex min-h-10 items-center rounded-lg rounded-bl-sm border border-[#e2e9e5] bg-white px-3.5 shadow-[0_1px_2px_rgba(21,42,32,0.04)]">
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#43866c] [animation-delay:-0.24s] motion-reduce:animate-none" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#43866c] [animation-delay:-0.12s] motion-reduce:animate-none" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#43866c] motion-reduce:animate-none" />
                  </span>
                </div>
              </div>
            )}
            {error && <p role="alert" className="ml-9 max-w-[84%] rounded-md border border-[#e7bbb7] bg-[#fff5f3] px-3 py-2 text-xs leading-relaxed text-[#a83c35]">{error}</p>}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="flex shrink-0 items-center gap-2 border-t border-[#e5e9e7] bg-white p-3">
            <input value={message} onChange={(event) => setMessage(event.target.value)} disabled={sending} aria-label="Mensahe sa chatbot" placeholder="Magtanong sa English o Filipino..." className="h-11 min-w-0 flex-1 rounded-md border border-[#dce3e1] bg-[#fafcfb] px-3 text-sm text-[#303b35] placeholder:text-[#929d97] transition-colors focus:border-[#6a9b83] focus:bg-white focus:outline-none disabled:bg-[#f4f6f5]" />
            <button type="submit" disabled={sending || !message.trim()} aria-label="Ipadala ang mensahe" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#285f50] text-white transition-colors hover:bg-[#1f4c40] disabled:cursor-not-allowed disabled:bg-[#a9bdb4]"><ArrowUp size={19} strokeWidth={2.4} /></button>
          </form>
        </section>
      )}
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={open ? "Isara ang chatbot" : "Buksan ang chatbot"} className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#285f50] text-white shadow-[0_5px_18px_rgba(31,76,64,0.3)] transition-[transform,background-color] hover:scale-[1.04] hover:bg-[#1f4c40] focus-visible:outline-offset-4">
        {open ? <X size={20} /> : <MessageCircle size={21} />}
      </button>
    </div>
  );
}