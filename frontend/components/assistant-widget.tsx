"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, LoaderCircle, Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { useLocale } from "@/app/providers";

type Message = { role: "user" | "assistant"; content: string };
type DashboardSection = "overview" | "accounts" | "catalog" | "financial";
type FinancialTab = "overview" | "receive" | "pay" | "receive-fx" | "sell-fx";
type AgentAction = { type: "navigate"; section: DashboardSection; tab?: FinancialTab } | { type: "search"; query: string } | null;
type SpeechRecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResult>; resultIndex: number }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

function getOfflineResponse(text: string, isFa: boolean): { reply: string; action: AgentAction } {
  const normalized = text.toLocaleLowerCase();
  const sections: { section: DashboardSection; terms: string[]; labelFa: string; labelEn: string }[] = [
    { section: "overview", terms: ["project", "projects", "overview", "پروژه", "پروژه‌ها", "نمای کلی"], labelFa: "پروژه‌ها", labelEn: "Projects" },
    { section: "accounts", terms: ["account", "accounts", "حساب", "حساب‌ها"], labelFa: "حساب‌ها", labelEn: "Accounts" },
    { section: "catalog", terms: ["catalog", "product", "products", "کالا", "کالاها", "محصول"], labelFa: "کالاها", labelEn: "Catalog" },
    { section: "financial", terms: ["finance", "financial", "payment", "payments", "receipt", "مالی", "پرداخت", "دریافت"], labelFa: "مالی", labelEn: "Finance" },
  ];
  const openIntent = /\b(open|show|go to|navigate|take me to)\b|باز کن|برو به|برو منوی|برو سراغ|برو سمت|رفتن به|نمایش بده|نشون بده|بخش/u.test(normalized);
  if (openIntent) {
    const match = sections.find((item) => item.terms.some((term) => normalized.includes(term)));
    if (match) return {
      reply: isFa ? `اتصال ابری در دسترس نیست، اما بخش «${match.labelFa}» را برایتان باز کردم.` : `Cloud AI is unavailable, but I opened ${match.labelEn} for you.`,
      action: { type: "navigate", section: match.section },
    };
  }
  const searchMatch = text.match(/(?:search(?:\s+for)?|جست(?:جو|‌وجو)(?:ی)?|پیدا(?:\s+کن)?)(?:\s+برای)?\s*[«"“]?(.+?)[»"”]?\s*$/iu);
  if (searchMatch?.[1]?.trim()) {
    const query = searchMatch[1].trim().slice(0, 100);
    return {
      reply: isFa ? `اتصال ابری در دسترس نیست؛ فهرست پروژه‌ها را با «${query}» فیلتر کردم.` : `Cloud AI is unavailable; I filtered the project list for “${query}”.`,
      action: { type: "search", query },
    };
  }
  return {
    reply: isFa
      ? "اتصال به هوش مصنوعی ابری برقرار نیست. در حالت آفلاین می‌توانم بخش‌های پروژه‌ها، حساب‌ها، کالاها یا مالی را باز کنم و فهرست پروژه‌ها را جست‌وجو کنم؛ برای اطلاعات زندهٔ پروژه‌ها دوباره آنلاین شوید."
      : "Cloud AI is unavailable. Offline, I can open Projects, Accounts, Catalog, or Finance and search the project list. Reconnect to get live project data.",
    action: null,
  };
}

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
  const [offline, setOffline] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenDeadlineRef = useRef(0);
  const keepListeningRef = useRef(false);
  const transcriptRef = useRef("");
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u0600-\u06ff]/u.test(text) ? "fa-IR" : "en-US";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }, []);

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
        signal: AbortSignal.timeout(12_000),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !("reply" in payload) || typeof payload.reply !== "string") {
        throw new Error("assistant request failed");
      }
      const reply = payload.reply;
      setOffline(false);
      const updatedMessages = [...nextMessages, { role: "assistant" as const, content: reply }].slice(-12);
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      if ("action" in payload && payload.action && typeof payload.action === "object") {
        const action = payload.action as AgentAction;
        if (action?.type === "navigate" && ["overview", "accounts", "catalog", "financial"].includes(action.section)) onAction(action);
        else if (action?.type === "search" && typeof action.query === "string") onAction(action);
      }
      if (spoken) speak(reply);
    } catch {
      const fallback = getOfflineResponse(text, isFa);
      setOffline(true);
      setError(isFa ? "حالت آفلاین فعال شد؛ پاسخ‌های هوشمند و داده‌های زنده در دسترس نیستند." : "Offline mode is active; AI answers and live data are unavailable.");
      const updatedMessages = [...nextMessages, { role: "assistant" as const, content: fallback.reply }].slice(-12);
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      if (fallback.action) onAction(fallback.action);
      if (spoken) speak(fallback.reply);
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
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    keepListeningRef.current = true;
    transcriptRef.current = "";
    listenDeadlineRef.current = Date.now() + 90_000;
    recognition.onresult = (event) => {
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = setTimeout(() => {
        keepListeningRef.current = false;
        recognition.stop();
      }, 2_500);
      const currentResults = Array.from(event.results).slice(event.resultIndex);
      const finalResults = currentResults
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript.trim() ?? "")
        .filter(Boolean);
      if (finalResults.length) transcriptRef.current = [transcriptRef.current, ...finalResults].filter(Boolean).join(" ");
      const interimText = currentResults
        .filter((result) => !result.isFinal)
        .map((result) => result[0]?.transcript.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      setInput([transcriptRef.current, interimText].filter(Boolean).join(" "));
    };
    recognition.onerror = () => {
      keepListeningRef.current = false;
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      setListening(false);
      setError(isFa ? "دسترسی میکروفن ممکن نیست؛ اجازهٔ میکروفن را بررسی کنید." : "Microphone access failed. Check your microphone permission.");
    };
    recognition.onend = () => {
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (keepListeningRef.current && Date.now() < listenDeadlineRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          keepListeningRef.current = false;
        }
      }
      keepListeningRef.current = false;
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      setListening(false);
      const spokenText = transcriptRef.current.trim();
      transcriptRef.current = "";
      if (spokenText) {
        setInput(spokenText);
        setError(isFa ? "متن تشخیص‌داده‌شده را بررسی یا اصلاح کنید، سپس ارسال را بزنید." : "Review or correct the recognized text, then press send.");
      } else {
        setInput("");
        setError(isFa ? "گفتاری تشخیص داده نشد؛ دوباره تلاش کنید یا پیام را تایپ کنید." : "No speech was recognized. Try again or type your message.");
      }
    };
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    listenTimeoutRef.current = setTimeout(() => {
      keepListeningRef.current = false;
      recognition.stop();
    }, 90_000);
    try {
      recognition.start();
    } catch {
      keepListeningRef.current = false;
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      setListening(false);
      setError(isFa ? "میکروفن در حال استفاده است یا اجازهٔ دسترسی داده نشده." : "The microphone is busy or permission was denied.");
    }
  }

  function stopListening() {
    keepListeningRef.current = false;
    recognitionRef.current?.stop();
  }

  return (
    <div className={`fixed bottom-20 z-50 flex flex-col gap-3 sm:bottom-4 ${isFa ? "left-4 items-start" : "right-4 items-end"}`} dir={isFa ? "rtl" : "ltr"}>
      {open && <section aria-label={isFa ? "دستیار هوشمند" : "AI assistant"} className="flex h-[min(540px,calc(100dvh-100px))] w-[min(370px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] border border-forest/10 bg-white shadow-2xl shadow-forest/20">
        <header className="flex items-center gap-3 bg-forest px-4 py-3.5 text-white">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15"><Bot className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-sm font-black">{isFa ? "دستیار هوشمند" : "AI assistant"}</h2>
            <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[11px] text-white/75"><span className={`size-1.5 rounded-full ${offline ? "bg-amber-300" : "bg-emerald-300"}`} />{offline ? (isFa ? "حالت آفلاین" : "Offline mode") : isFa ? `آمادهٔ پاسخ‌گویی به ${userName || "شما"}` : `Ready to help, ${userName || "there"}`}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label={isFa ? "بستن دستیار" : "Close assistant"} className="grid size-9 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"><ChevronDown className="size-5" aria-hidden="true" /></button>
        </header>

        <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto bg-[#fbfcfa] p-4">
          {messages.length === 0 && <div className="rounded-2xl border border-sage-dark/20 bg-sage/40 p-4">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-bold text-forest"><Sparkles className="size-3" aria-hidden="true" />{isFa ? "دستیار آماده است" : "Assistant online"}</span>
            <p className="m-0 text-sm font-bold leading-6 text-forest">{isFa ? `سلام ${userName || "دوست عزیز"}، خوش آمدی! کافی است بگویی چه کاری انجام بدهم.` : `Welcome, ${userName || "there"}! Just tell me what you would like me to do.`}</p>
            <p className="mb-1 mt-3 text-xs font-extrabold text-forest">{isFa ? "می‌توانم این کارها را برایت انجام دهم:" : "Here are some things I can do:"}</p>
            <ul className="m-0 list-disc space-y-1 ps-5 text-xs leading-5 text-ink">
              {isFa ? <>
                <li>بازکردن بخش پروژه‌ها، حساب‌ها، کالاها یا امور مالی؛ حتی با عبارت‌های مختلف مثل «برو منوی کالاها».</li>
                <li>جست‌وجو و نمایش اطلاعات پروژه‌ها، حساب‌ها، کالاها و موجودی، اسناد مالی، صرافی‌ها و محموله‌ها.</li>
                <li>ثبت کالا یا ملزومات در پروژه؛ نام کالا و پروژه را بگو.</li>
                <li>به‌خاطر سپردن ترجیحت، اگر صریحاً بگویی «این را به خاطر بسپار».</li>
              </> : <>
                <li>Open Projects, Accounts, Catalog, or Finance—even with different phrasing.</li>
                <li>Search and show project, account, product/stock, ledger, exchange, and shipment information.</li>
                <li>Register a product or supply; tell me its name and project.</li>
                <li>Remember a preference when you explicitly ask me to.</li>
              </>}
            </ul>
            <p className="mb-0 mt-2 text-[11px] leading-5 text-muted">{isFa ? "برای گفت‌وگوی صوتی، میکروفن را بزنید؛ متن گفتار را بررسی و اصلاح کنید و سپس ارسال را بزنید." : "Press the microphone to speak, review or correct the transcript, then press send."}</p>
          </div>}
          {messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.role === "user" ? "ms-auto bg-forest text-white" : "me-auto border border-line bg-white text-ink"}`}>
            <p className="m-0 whitespace-pre-wrap">{message.content}</p>
          </div>)}
          {busy && <div role="status" className="me-auto flex items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-2.5 text-xs text-muted"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{isFa ? "در حال بررسی…" : "Thinking…"}</div>}
          {error && <p role="alert" className="m-0 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p>}
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }} className="flex items-center gap-2 border-t border-line bg-white p-3">
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
