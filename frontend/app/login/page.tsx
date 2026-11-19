"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { useLocale } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { fetchWithTimeout } from "@/lib/http";

const heroImage = "/images/produce-market.webp";

export default function LoginPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const isFa = locale === "fa";
  const BackArrow = isFa ? ArrowRight : ArrowLeft;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "oauth") {
      setError(isFa ? "ورود کامل نشد؛ لطفاً دوباره تلاش کنید." : "Sign-in did not complete. Please try again.");
    }
    fetchWithTimeout("/api/v1/auth/session", { cache: "no-store" }, 8_000)
      .then(async (response) => {
        if (!response.ok) return;
        const session = await response.json() as { authenticated?: boolean; authorized?: boolean };
        if (!active) return;
        if (!session.authenticated) return;
        if (session.authorized === false) setError(t.accountNotAllowed);
        else router.replace("/dashboard");
      })
      .catch(() => { if (active) setError(t.connectionError); });
    return () => { active = false; };
  }, [isFa, router, t.accountNotAllowed, t.connectionError]);

  async function startLogin() {
    setPending(true);
    setError("");
    try {
      const response = await fetchWithTimeout("/api/v1/auth/start", {
        method: "POST",
        headers: { "X-App-Origin": window.location.origin },
      }, 10_000);
      const payload = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(response.status === 503 ? t.loginNotConfigured : t.connectionError);
      }
      window.location.assign(payload.authorizationUrl);
    } catch (cause) {
      const timedOut = cause instanceof Error && (cause.name === "AbortError" || cause.name === "TimeoutError");
      setError(timedOut ? t.connectionError : cause instanceof Error ? cause.message : t.connectionError);
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream p-3 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-6xl overflow-hidden rounded-[30px] border border-line bg-paper shadow-xl shadow-forest/5 sm:min-h-[calc(100vh-3rem)] lg:grid-cols-2">
        <section className="flex flex-col p-6 sm:p-10 lg:p-12">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-3"><BrandMark /></Link>
            <LanguageToggle />
          </div>
          <div className="mx-auto my-auto w-full max-w-md py-10">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-forest">
              <BackArrow className="size-4" aria-hidden="true" />{t.backHome}
            </Link>
            <div className="mb-6 grid size-14 place-items-center rounded-[20px] bg-sage text-forest"><LockKeyhole className="size-6" aria-hidden="true" /></div>
            <h1 className="m-0 text-3xl font-black tracking-tight text-forest">{t.loginTitle}</h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-muted">{t.loginSubtitle}</p>

            <div className="mt-6 rounded-2xl border border-sage-dark/70 bg-sage/70 px-4 py-3 text-xs leading-6 text-forest">
              {isFa ? "ورود امن با حساب Manus؛ دسترسی اعضا و نقش‌های داخلی شرکت در گام بعدی تعریف می‌شود." : "Secure sign-in with a Manus account. Company membership and internal roles will be configured in a later step."}
            </div>
            {error && <p role="alert" className="mb-0 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error}</p>}

            <button type="button" onClick={startLogin} disabled={pending} className="mt-7 flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-forest px-5 text-sm font-extrabold text-white shadow-sm shadow-forest/15 transition hover:bg-forest-light disabled:cursor-wait disabled:opacity-70">
              <span>{pending ? (isFa ? "در حال انتقال…" : "Redirecting…") : (isFa ? "ورود با حساب Manus" : "Continue with Manus")}</span>
              {!pending && <ArrowUpRight className="size-4" aria-hidden="true" />}
            </button>
            <p className="mb-0 mt-5 text-center text-xs leading-6 text-muted">
              {isFa ? "اگر کاربران شرکت حساب Manus ندارند، ارائه‌دهندهٔ ورود سازمانی را پیش از بهره‌برداری انتخاب می‌کنیم." : "If company users do not have Manus accounts, we will choose an organization login provider before launch."}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted">
            <span>{t.footerLine}</span>
            <BrandMark compact />
          </div>
        </section>

        <aside className="relative hidden min-h-full overflow-hidden bg-forest lg:block">
          <Image src={heroImage} alt={t.services[0].alt} fill priority sizes="50vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b2019]/85 via-[#102c22]/20 to-[#102c22]/20" />
          <div className="absolute inset-x-10 bottom-10 rounded-[26px] border border-white/20 bg-white/10 p-7 text-white backdrop-blur-md">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-light">Multi-Project Manager</span>
            <p className="mb-0 mt-3 text-2xl font-black leading-relaxed">{t.heroTitle.replace("\n", " ")}</p>
            <p className="mb-0 mt-3 text-sm leading-7 text-white/75">{t.heroDescription}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
