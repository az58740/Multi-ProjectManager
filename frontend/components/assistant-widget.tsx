"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, LoaderCircle, Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { useLocale } from "@/app/providers";

type Message = { role: "user" | "assistant"; content: string };
type DashboardSection = "overview" | "accounts" | "catalog" | "financial";
type AgentAction = { type: "navigate"; section: DashboardSection } | { type: "search"; query: string } | null;
type SpeechRecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResult> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

type AssistantWidgetProps = {
  userName: string;
  onAction: (action: AgentAction) => void;
};

export function AssistantWidget({ userName, onAction }: AssistantWidgetProps) {
  const { locale } = useLocale();
  const isFa = locale === "fa";
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isFa ? "fa-IR" : "en-US";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }, [isFa]);

  const sendMessage = useCallback(async (rawText: string, spoken = false) => {
    const text = rawText.trim();
    if (!text || busy) return;
    const nextMessages = [...messagesRef.current, { role: "user" as const, content: text }].slice(-12);
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, locale }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !("reply" in payload) || typeof payload.reply !== "string") {
        throw new Error("assistant request failed");
      }
      const reply = payload.reply;
      const updatedMessages = [...nextMessages, { role: "assistant" as const, content: reply }].slice(-12);
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      if ("action" in payload && payload.action && typeof payload.action === "object") {
        const action = payload.action as AgentAction;
        if (action && (action.type === "navigate" || action.type === "search")) onAction(action);
      }
      if (spoken) speak(reply);
    } catch {
      setError(isFa ? "اتصال به دستیار برقرار نشد. دوباره تلاش کنید." : "The assistant could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, isFa, locale, onAction, speak]);

  function startListening() {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognitionConstructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      setError(isFa ? "تشخیص گفتار در این مرورگر پشتیبانی نمی‌شود." : "Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = isFa ? "fa-IR" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const spokenText = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (spokenText) void sendMessage(spokenText, true);
    };
    recognition.onerror = () => {
      setListening(false);
      setError(isFa ? "دسترسی میکروفن ممکن نیست؛ اجازهٔ میکروفن را بررسی کنید." : "Microphone access failed. Check your microphone permission.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError(isFa ? "میکروفن در حال استفاده است یا اجازهٔ دسترسی داده نشده." : "The microphone is busy or permission was denied.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  return (
    <div className={`fixed bottom-4 z-50 flex flex-col gap-3 ${isFa ? "left-4 items-start" : "right-4 items-end"}`} dir={isFa ? "rtl" : "ltr"}>
      {open && <section aria-label={isFa ? "دستیار هوشمند" : "AI assistant"} className="flex h-[min(540px,calc(100dvh-100px))] w-[min(370px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] border border-forest/10 bg-white shadow-2xl shadow-forest/20">
        <header className="flex items-center gap-3 bg-forest px-4 py-3.5 text-white">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15"><Bot className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-sm font-black">{isFa ? "دستیار هوشمند" : "AI assistant"}</h2>
            <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[11px] text-white/75"><span className="size-1.5 rounded-full bg-emerald-300" />{isFa ? `آمادهٔ پاسخ‌گویی به ${userName || "شما"}` : `Ready to help, ${userName || "there"}`}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label={isFa ? "بستن دستیار" : "Close assistant"} className="grid size-9 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"><ChevronDown className="size-5" aria-hidden="true" /></button>
        </header>

        <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto bg-[#fbfcfa] p-4">
          {messages.length === 0 && <div className="rounded-2xl border border-sage-dark/20 bg-sage/40 p-4">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-bold text-forest"><Sparkles className="size-3" aria-hidden="true" />{isFa ? "دستیار آماده است" : "Assistant online"}</span>
            <p className="m-0 text-sm font-bold leading-6 text-forest">{isFa ? `${userName || "سلام"} عزیز، چطور می‌توانم کمک کنم؟ می‌توانید دربارهٔ پروژه‌ها بپرسید یا بخواهید بخشی را باز کنم.` : `Hello ${userName || "there"}, how can I help? Ask about projects or tell me which section to open.`}</p>
            <p className="mb-0 mt-2 text-xs leading-5 text-muted">{isFa ? "برای گفت‌وگو با صدا، دکمهٔ میکروفن را بزنید و اجازهٔ مرورگر را تأیید کنید." : "To speak, press the microphone button and allow browser access."}</p>
          </div>}
          {messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.role === "user" ? "ms-auto bg-forest text-white" : "me-auto border border-line bg-white text-ink"}`}>
            <p className="m-0 whitespace-pre-wrap">{message.content}</p>
          </div>)}
          {busy && <div role="status" className="me-auto flex items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-2.5 text-xs text-muted"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{isFa ? "در حال بررسی…" : "Thinking…"}</div>}
          {error && <p role="alert" className="m-0 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p>}
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }} className="flex items-center gap-2 border-t border-line bg-white p-3">
          <button type="button" onClick={listening ? stopListening : startListening} disabled={busy} aria-label={listening ? (isFa ? "توقف ضبط صدا" : "Stop listening") : (isFa ? "شروع گفتار" : "Start voice input")} className={`grid size-10 shrink-0 place-items-center rounded-xl transition disabled:opacity-50 ${listening ? "bg-red-100 text-red-700" : "bg-sage/55 text-forest hover:bg-sage"}`}>
            {listening ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
          </button>
          <label htmlFor="assistant-message" className="sr-only">{isFa ? "پیام به دستیار" : "Message the assistant"}</label>
          <input id="assistant-message" value={input} onChange={(event) => setInput(event.target.value)} placeholder={isFa ? "پیام خود را بنویسید…" : "Write a message…"} maxLength={1600} className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-forest/40 focus:ring-2 focus:ring-sage" />
          <button type="submit" disabled={busy || !input.trim()} aria-label={isFa ? "ارسال پیام" : "Send message"} className="grid size-10 shrink-0 place-items-center rounded-xl bg-forest text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-40"><Send className="size-4" aria-hidden="true" /></button>
        </form>
      </section>}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? (isFa ? "بستن دستیار هوشمند" : "Close AI assistant") : (isFa ? "بازکردن دستیار هوشمند" : "Open AI assistant")} className="relative grid size-14 place-items-center rounded-full bg-forest text-white shadow-xl shadow-forest/25 transition hover:-translate-y-0.5 hover:bg-forest/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
        {open ? <X className="size-5" aria-hidden="true" /> : <Bot className="size-6" aria-hidden="true" />}
        {!open && <span aria-hidden="true" className="absolute end-0 top-0 size-3 rounded-full border-2 border-white bg-emerald-400" />}
      </button>
    </div>
  );
}
