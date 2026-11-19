"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight, Boxes, Building2, Check, House, Leaf, PackageCheck, Warehouse } from "lucide-react";
import { useLocale } from "@/app/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const asset = {
  hero: "/images/produce-market.webp",
  cold: "/images/cold-storage.webp",
  sorting: "/images/fruit-sorting.webp",
  construction: "/images/construction-site.webp",
  property: "/images/property-rental.webp",
};

const serviceVisuals = [
  { image: "", Icon: PackageCheck, tone: "bg-amber-soft text-forest" },
  { image: asset.cold, Icon: Warehouse, tone: "bg-sage text-forest" },
  { image: asset.sorting, Icon: Boxes, tone: "bg-[#edf1e5] text-forest" },
  { image: asset.construction, Icon: Building2, tone: "bg-[#f0ebe3] text-forest" },
  { image: asset.property, Icon: House, tone: "bg-[#f4eee1] text-forest" },
];

export default function HomePage() {
  const { locale, t } = useLocale();
  const isFa = locale === "fa";
  const ActionArrow = isFa ? ArrowUpLeft : ArrowUpRight;
  const LongArrow = isFa ? ArrowLeft : ArrowRight;

  return (
    <main className="overflow-hidden">
      <SiteHeader />
      <section id="overview" className="relative mx-auto grid max-w-7xl items-center gap-9 px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="relative z-10 order-2 lg:order-1">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sage-dark/70 bg-white/80 px-4 py-2 text-xs font-bold text-forest sm:text-sm">
            <span className="size-2 rounded-full bg-amber" />
            {t.heroKicker}
          </div>
          <h1 className="m-0 whitespace-pre-line text-4xl font-black leading-[1.28] tracking-tight text-forest sm:text-5xl lg:text-[4.15rem] lg:leading-[1.18]">{t.heroTitle}</h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-muted sm:text-lg sm:leading-9">{t.heroDescription}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/login" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-forest px-6 text-sm font-bold text-white shadow-lg shadow-forest/15 transition hover:-translate-y-0.5 hover:bg-forest-light">
              {t.heroPrimary}
              <ActionArrow className="size-4" aria-hidden="true" />
            </Link>
            <a href="#activities" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-line bg-paper px-6 text-sm font-bold text-ink transition hover:border-sage-dark hover:bg-white">
              {t.heroSecondary}
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
          </div>
          <div className="mt-9 flex items-center gap-3 text-sm font-semibold text-forest">
            <span className="grid size-9 place-items-center rounded-full bg-amber-soft text-amber"><Leaf className="size-4" aria-hidden="true" /></span>
            <span>{t.heroNote}</span>
          </div>
        </div>

        <div className="relative order-1 min-h-[330px] overflow-hidden rounded-[30px] bg-forest shadow-2xl shadow-forest/15 sm:min-h-[450px] lg:order-2 lg:min-h-[560px] lg:rounded-[38px]">
          <Image src={asset.hero} alt={t.services[0].alt} fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b2019]/70 via-[#0b2019]/5 to-transparent" />
          <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 sm:inset-x-7 sm:bottom-7">
            <div className="max-w-xs rounded-[20px] border border-white/20 bg-white/90 p-4 shadow-xl backdrop-blur-md sm:p-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-forest"><span className="size-2 rounded-full bg-amber" />{t.featureTag}</div>
              <p className="m-0 text-sm font-black leading-6 text-ink sm:text-base">{t.heroNote}</p>
            </div>
            <div className="hidden size-14 shrink-0 place-items-center rounded-full border border-white/35 bg-forest/25 text-white backdrop-blur-sm sm:grid">
              <Leaf className="size-6" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section id="activities" className="bg-paper py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-9 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber">01 / {t.featureTag}</span>
              <h2 className="mb-0 mt-3 text-3xl font-black tracking-tight text-forest sm:text-4xl">{t.servicesTitle}</h2>
            </div>
            <p className="m-0 max-w-xl text-sm leading-7 text-muted sm:text-base">{t.servicesSubtitle}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {t.services.map((service, index) => {
              const visual = serviceVisuals[index];
              const Icon = visual.Icon;
              return (
                <article key={service.title} className="group overflow-hidden rounded-[26px] border border-line bg-white transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-forest/5">
                  <div className={`relative h-48 overflow-hidden ${visual.tone}`}>
                    {visual.image ? (
                      <Image src={visual.image} alt={service.alt} fill sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_75%_28%,#fff8e5_0%,transparent_30%),linear-gradient(135deg,#f2e6c9,#dce8da)]">
                        <div className="relative grid size-24 place-items-center rounded-[30px] border border-white/70 bg-white/70 shadow-sm">
                          <PackageCheck className="size-11 text-forest" strokeWidth={1.6} aria-hidden="true" />
                          <Leaf className="absolute -right-2 -top-2 size-7 rotate-12 rounded-full bg-amber-soft p-1 text-amber" aria-hidden="true" />
                        </div>
                      </div>
                    )}
                    <span className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/60 bg-white/90 text-forest shadow-sm backdrop-blur">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="absolute bottom-3 left-4 rounded-full bg-forest/75 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">0{index + 1}</span>
                  </div>
                  <div className="p-5 sm:p-6">
                    <h3 className="m-0 text-lg font-extrabold text-forest">{service.title}</h3>
                    <p className="mb-0 mt-2 text-sm leading-7 text-muted">{service.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="approach" className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid overflow-hidden rounded-[32px] bg-forest text-white lg:grid-cols-[0.85fr_1.15fr] lg:rounded-[40px]">
          <div className="relative min-h-64 overflow-hidden bg-[#214f40] p-8 sm:p-10 lg:min-h-[420px] lg:p-12">
            <div className="absolute -left-16 -top-20 size-72 rounded-full border border-white/10" />
            <div className="absolute -left-2 -top-6 size-48 rounded-full border border-white/10" />
            <div className="relative flex h-full min-h-52 flex-col justify-between">
              <div className="grid size-14 place-items-center rounded-[20px] bg-white/10 text-amber-light"><Boxes className="size-7" aria-hidden="true" /></div>
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-light">{t.approachKicker}</span>
                <h2 className="mb-0 mt-3 max-w-sm text-3xl font-black leading-tight sm:text-4xl">{t.approachTitle}</h2>
              </div>
            </div>
          </div>
          <div className="p-8 sm:p-10 lg:p-14">
            <p className="m-0 max-w-2xl text-base leading-8 text-white/75 sm:text-lg sm:leading-9">{t.approachDescription}</p>
            <ul className="mt-8 space-y-4 p-0">
              {t.approachPoints.map((point) => (
                <li key={point} className="flex list-none items-center gap-3 text-sm font-semibold text-white/90 sm:text-base">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-amber-light"><Check className="size-4" aria-hidden="true" /></span>
                  {point}
                </li>
              ))}
            </ul>
            <Link href="/login" className="mt-8 inline-flex items-center gap-3 rounded-full bg-amber-light px-6 py-3.5 text-sm font-extrabold text-forest transition hover:-translate-y-0.5 hover:bg-amber-bright">
              {t.dashboardCtaButton}
              <LongArrow className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-[28px] border border-sage-dark/70 bg-sage/65 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-9">
          <div>
            <span className="text-xs font-extrabold text-forest">02 / {t.approachKicker}</span>
            <h2 className="mb-0 mt-2 text-2xl font-black text-forest sm:text-3xl">{t.dashboardCtaTitle}</h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-muted">{t.dashboardCtaDescription}</p>
          </div>
          <Link href="/login" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-full bg-forest px-6 text-sm font-bold text-white transition hover:bg-forest-light">
            {t.dashboardCtaButton}<LongArrow className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
