"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { useLocale } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { accountMessages } from "@/lib/account-i18n";
import { isValidNewPassword, jsonHeaders, responseError, type Session } from "@/lib/accounts";
import { fetchWithTimeout } from "@/lib/http";

const inputClass = "mt-2 min-h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";

export default function LoginPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const m = accountMessages[locale];
  const BackArrow = locale === "fa" ? ArrowRight : ArrowLeft;
  const [signUp, setSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    let active = true;
    setSessionEnded(new URLSearchParams(window.location.search).get("reason") === "session-ended");
    fetchWithTimeout("/api/v1/auth/session", { cache: "no-store" }, 8_000)
      .then(async (response) => {
        if (!response.ok) {
          if (active && response.status >= 500) setError(accountMessages[locale].sessionError);
          return;
        }
        const session = await response.json() as Session;
        if (!active) return;
        if (session.authenticated && session.authorized === true) router.replace("/dashboard");
        else if (session.authenticated && session.authorized === false) setError(t.accountNotAllowed);
      })
      .catch(() => { if (active) setError(accountMessages[locale].sessionError); });
    return () => { active = false; };
  }, [locale, router, t.accountNotAllowed]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    const name = String(fields.get("name") ?? "").trim();
    if (signUp && !name) { setError(m.invalidInput); return; }
    if (signUp && !isValidNewPassword(password)) { setError(m.passwordRule); return; }
    setBusy(true);
    setError("");
    setNotice(false);
    try {
      const response = await fetchWithTimeout(signUp ? "/api/v1/auth/register" : "/api/v1/auth/login", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(signUp ? { name, email, password } : { email, password }),
      }, 10_000);
      if (!response.ok) {
        setError(await responseError(response, locale, signUp ? "other" : "login"));
        return;
      }
      if (signUp) {
        const result = await response.json() as { status?: string };
        if (response.status !== 201 || result.status !== "active") { setError(m.serviceError); return; }
        form.reset();
        setSignUp(false);
        setNotice(true);
      } else {
        const session = await response.json() as Session;
        if (session.authenticated === true && session.authorized === true && session.user) {
          form.reset();
          router.replace("/dashboard");
        } else setError(m.forbidden);
      }
    } catch {
      setError(m.connectionError);
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setSignUp((current) => !current);
    setError("");
    setNotice(false);
  }

  return (
    <main className="min-h-screen bg-cream p-3 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-6xl overflow-hidden rounded-[30px] border border-line bg-paper shadow-xl shadow-forest/5 sm:min-h-[calc(100vh-3rem)] lg:grid-cols-2">
        <section className="flex flex-col p-6 sm:p-10 lg:p-12">
          <div className="flex items-center justify-between gap-3"><Link href="/" className="inline-flex items-center gap-3"><BrandMark /></Link><LanguageToggle /></div>
          <div className="mx-auto my-auto w-full max-w-md py-10">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-forest"><BackArrow className="size-4" aria-hidden="true" />{t.backHome}</Link>
            <div className="mb-6 grid size-14 place-items-center rounded-[20px] bg-sage text-forest"><LockKeyhole className="size-6" aria-hidden="true" /></div>
            <h1 className="m-0 text-3xl font-black tracking-tight text-forest">{signUp ? m.signUpTitle : t.loginTitle}</h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-muted">{signUp ? m.signUpSubtitle : t.loginSubtitle}</p>
            {notice && <p role="status" className="mb-0 mt-5 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm leading-6 text-forest">{m.pendingRegistration}</p>}
            {sessionEnded && <p role="status" className="mb-0 mt-5 rounded-2xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm leading-6 text-forest">{m.sessionEnded}</p>}
            {error && <p role="alert" className="mb-0 mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error}</p>}
            <form onSubmit={submit} aria-busy={busy} className="mt-6 space-y-4">
              {signUp && <label htmlFor="account-name" className="block text-sm font-bold text-ink">{m.name}<input id="account-name" name="name" autoComplete="name" required className={inputClass} /></label>}
              <label htmlFor="account-email" className="block text-sm font-bold text-ink">{m.email}<input id="account-email" name="email" type="email" autoComplete="email" required dir="ltr" className={inputClass} /></label>
              <label htmlFor="account-password" className="block text-sm font-bold text-ink">{m.password}<input id="account-password" name="password" type="password" autoComplete={signUp ? "new-password" : "current-password"} required dir="ltr" className={inputClass} /></label>
              {signUp && <p className="!mt-1 text-xs leading-6 text-muted">{m.passwordRule}</p>}
              <button type="submit" disabled={busy} className="flex min-h-14 w-full items-center justify-center rounded-full bg-forest px-5 text-sm font-extrabold text-white shadow-sm shadow-forest/15 transition hover:bg-forest-light disabled:cursor-wait disabled:opacity-70">{busy ? (signUp ? m.signingUp : m.signingIn) : (signUp ? m.signUpAction : m.signInAction)}</button>
            </form>
            <p className="mb-0 mt-5 text-center text-sm text-muted">{signUp ? m.haveAccount : m.noAccount} <button type="button" onClick={toggleMode} disabled={busy} className="font-bold text-forest underline decoration-sage-dark underline-offset-4 disabled:opacity-60">{signUp ? m.signIn : m.signUp}</button></p>
            <p className="mb-0 mt-4 text-center text-xs leading-6 text-muted">{m.forgotPassword}</p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted"><span>{t.footerLine}</span><BrandMark compact /></div>
        </section>
        <aside className="relative hidden min-h-full overflow-hidden bg-forest lg:block">
          <Image src="/images/produce-market.webp" alt={t.services[0].alt} fill priority sizes="50vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b2019]/85 via-[#102c22]/20 to-[#102c22]/20" />
          <div className="absolute inset-x-10 bottom-10 rounded-[26px] border border-white/20 bg-white/10 p-7 text-white backdrop-blur-md"><span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-light">Multi-Project Manager</span><p className="mb-0 mt-3 text-2xl font-black leading-relaxed">{t.heroTitle.replace("\n", " ")}</p><p className="mb-0 mt-3 text-sm leading-7 text-white/75">{t.heroDescription}</p></div>
        </aside>
      </div>
    </main>
  );
}
