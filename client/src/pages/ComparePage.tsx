import { useEffect } from "react";
import { PLAN_PRICING, TRIAL_COPY } from "@shared/stripe-constants";
import { Check, ChevronRight, Minus, X } from "lucide-react";

import { useSignupModal } from "@/components/SignupModalProvider";
import { track } from "@/lib/analytics";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Seo } from "@/lib/seo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type CellValue = { text: string; tone: "good" | "bad" | "neutral" };

const COMPARISON_ROWS: { label: string; rxfit: CellValue; trainer: CellValue; apps: CellValue }[] = [
  {
    label: "Typical monthly cost",
    rxfit: { text: `${PLAN_PRICING.kickstart.perMonthShort} (${TRIAL_COPY})`, tone: "good" },
    trainer: { text: "$400–$800/mo for 2–3 sessions a week", tone: "bad" },
    apps: { text: "$10–$40/mo", tone: "neutral" },
  },
  {
    label: "Human accountability",
    rxfit: { text: "Dedicated human coach with daily check-ins", tone: "good" },
    trainer: { text: "Strong — but only during booked sessions", tone: "neutral" },
    apps: { text: "None — push notifications are easy to ignore", tone: "bad" },
  },
  {
    label: "Wearable data integration",
    rxfit: { text: "Syncs Oura, Garmin, Apple Health, Strava into one dashboard your coach actually reads", tone: "good" },
    trainer: { text: "Rarely — most trainers never see your sleep or recovery data", tone: "bad" },
    apps: { text: "Often syncs data, but no one interprets it for you", tone: "neutral" },
  },
  {
    label: "Availability",
    rxfit: { text: "AI dashboard 24/7 + coach messaging throughout the week", tone: "good" },
    trainer: { text: "Fixed appointment slots; travel and scheduling required", tone: "bad" },
    apps: { text: "24/7, but fully self-serve", tone: "neutral" },
  },
  {
    label: "Personalization",
    rxfit: { text: "Plan adjusted daily from your actual sleep, HRV, and training data", tone: "good" },
    trainer: { text: "High in-session, based on what you tell them", tone: "neutral" },
    apps: { text: "Template programs with light algorithmic tweaks", tone: "bad" },
  },
  {
    label: "Adapts when life happens",
    rxfit: { text: "Coach sees a bad sleep week and adjusts your workouts automatically", tone: "good" },
    trainer: { text: "Only if you bring it up at your next session", tone: "neutral" },
    apps: { text: "The plan marches on whether you slept or not", tone: "bad" },
  },
];

const OPTIONS = [
  {
    name: "RxFit.ai",
    tagline: "AI data analysis + a real human coach",
    pros: [
      "A dedicated coach who sees your wearable data and adjusts your plan daily",
      "One dashboard for Oura, Garmin, Apple Health, Strava, and more",
      `A fraction of the cost of in-person training (${PLAN_PRICING.kickstart.perMonthShort} vs $400+/mo)`,
      "Accountability that follows you all week, not just at appointments",
    ],
    cons: [
      "No in-person, hands-on form coaching",
      "You need a wearable or health app to get the most out of it",
    ],
    highlight: true,
  },
  {
    name: "Traditional personal trainer",
    tagline: "In-person, hands-on coaching",
    pros: [
      "Hands-on form correction and spotting during sessions",
      "Strong motivation while you're in the room together",
      "Good for absolute beginners learning fundamental movements",
    ],
    cons: [
      "Typically $400–$800/month for only 2–3 hours a week",
      "Almost never sees your sleep, recovery, or nutrition data",
      "Accountability disappears between sessions",
      "Scheduling, commuting, and cancellations add friction",
    ],
    highlight: false,
  },
  {
    name: "Standalone fitness apps",
    tagline: "Self-serve programs and tracking",
    pros: [
      "Cheapest option ($10–$40/month or free)",
      "Available anywhere, any time",
      "Great libraries of workouts and tracking features",
    ],
    cons: [
      "No human accountability — most users quit within weeks",
      "Data gets collected but nobody interprets it or acts on it",
      "Generic template plans that don't adapt to your recovery",
    ],
    highlight: false,
  },
];

const WHO_SHOULD = [
  {
    title: "Choose RxFit.ai if…",
    body: "You already own a wearable, you're busy, and your problem is consistency — not information. You want expert direction from your real data plus a human who notices when you drift, at a fraction of the cost of in-person training.",
    highlight: true,
  },
  {
    title: "Choose a personal trainer if…",
    body: "You're brand new to lifting and need hands-on form coaching, you're rehabbing an injury that needs physical supervision, or in-person energy is what genuinely keeps you showing up — and the $400+/month price fits your budget.",
    highlight: false,
  },
  {
    title: "Choose a fitness app if…",
    body: "You're self-motivated, you've proven you can stick to a plan without external accountability, and you mainly want a structured workout library and a place to log your training on a small budget.",
    highlight: false,
  },
];

const COMPARE_FAQ = [
  {
    q: "Is RxFit.ai a replacement for a personal trainer?",
    a: `For most people whose main challenge is consistency, yes. RxFit gives you a real human coach who reviews your wearable data and adjusts your plan daily, for ${PLAN_PRICING.kickstart.perMonth} instead of $400–$800/month. A traditional in-person trainer is still the better choice if you need hands-on form correction or supervised injury rehab.`,
  },
  {
    q: "How is RxFit different from fitness apps like workout trackers?",
    a: "Fitness apps collect data and serve template programs, but no human ever looks at your numbers or holds you accountable. RxFit adds a dedicated human coach on top of the AI dashboard — someone who sees your sleep, recovery, and training data and messages you throughout the week.",
  },
  {
    q: "How much does RxFit cost compared to a personal trainer?",
    a: `RxFit starts at ${PLAN_PRICING.kickstart.perMonth} with a ${TRIAL_COPY}. A traditional personal trainer typically costs $400–$800/month for two to three sessions per week — roughly ten times the price for a few hours of weekly contact.`,
  },
  {
    q: "Do I need a wearable device to use RxFit?",
    a: "RxFit works best with a wearable or health app such as Oura, Garmin, Apple Health, or Strava, because your coach uses that data to personalize your plan. Most members already own one before joining.",
  },
];

function ToneIcon({ tone }: { tone: CellValue["tone"] }) {
  if (tone === "good") return <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />;
  if (tone === "bad") return <X className="w-4 h-4 text-destructive/70 shrink-0 mt-0.5" aria-hidden="true" />;
  return <Minus className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" aria-hidden="true" />;
}

export default function ComparePage() {
  const { open: openSignup } = useSignupModal();

  useEffect(() => {
    track("pageview", { slug: "compare" });
    let fired50 = false;
    let fired90 = false;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrolled = window.scrollY + window.innerHeight;
        const pct = scrolled / document.documentElement.scrollHeight;
        if (!fired50 && pct >= 0.5) {
          fired50 = true;
          track("scroll_50", { slug: "compare" });
        }
        if (!fired90 && pct >= 0.9) {
          fired90 = true;
          track("scroll_90", { slug: "compare" });
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground">
      <Seo
        title="AI Health Coach vs Personal Trainer vs Fitness Apps — RxFit.ai"
        description="An honest comparison of RxFit.ai, traditional personal trainers, and standalone fitness apps: cost, human accountability, wearable data integration, availability, and personalization."
        canonicalPath="/compare"
        image="/opengraph.jpg"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
        ]}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: COMPARE_FAQ.map((it) => ({
              "@type": "Question",
              name: it.q,
              acceptedAnswer: { "@type": "Answer", text: it.a },
            })),
          },
        ]}
      />

      <SiteHeader />

      <main>
        {/* Hero */}
        <header className="relative pt-32 pb-16 md:pt-44 md:pb-20 px-6 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary/10 blur-[120px] rounded-full -z-10" />
          <div className="container mx-auto text-center max-w-4xl relative z-10 space-y-6">
            <div className="hud-label text-primary">Honest Comparison</div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight text-foreground">
              AI Health Coach vs. Personal Trainer vs. Fitness Apps
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed" data-testid="text-compare-intro">
              There are three ways to get fit with help: hire an in-person personal trainer
              ($400–$800/month), use a self-serve fitness app ($10–$40/month), or combine AI data
              analysis with a real human coach — which is what RxFit.ai does, from {PLAN_PRICING.kickstart.perMonth}.
              Here's an honest look at when each one makes sense.
            </p>
          </div>
        </header>

        {/* Comparison table */}
        <section className="pb-20 px-6">
          <div className="container mx-auto max-w-5xl">
            <div className="hud-corner glass-card rounded-2xl overflow-x-auto" data-testid="compare-table">
              <table className="w-full text-left border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="p-5 hud-label text-muted-foreground">Criteria</th>
                    <th scope="col" className="p-5 hud-label text-primary">RxFit.ai</th>
                    <th scope="col" className="p-5 hud-label text-foreground/80">Personal Trainer</th>
                    <th scope="col" className="p-5 hud-label text-foreground/80">Fitness Apps</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0 align-top">
                      <th scope="row" className="p-5 text-sm font-bold text-foreground">{row.label}</th>
                      {[row.rxfit, row.trainer, row.apps].map((cell, ci) => (
                        <td key={ci} className={`p-5 text-sm ${ci === 0 ? "text-foreground/90 bg-primary/5" : "text-foreground/70"}`}>
                          <span className="flex items-start gap-2">
                            <ToneIcon tone={cell.tone} />
                            {cell.text}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-4 text-center">
              Personal trainer and app pricing reflect typical U.S. market ranges; individual rates vary.
            </p>
          </div>
        </section>

        {/* Pros & cons */}
        <section className="py-20 px-6 bg-card/50">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">The Honest Pros &amp; Cons</h2>
              <p className="text-muted-foreground">No option is perfect. Here's the full picture.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {OPTIONS.map((opt) => (
                <div
                  key={opt.name}
                  className={`hud-corner glass-card rounded-3xl p-8 flex flex-col ${opt.highlight ? "hud-glow-box" : "glass-card-hover"}`}
                  data-testid={`compare-card-${opt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  <h3 className={`text-xl font-bold mb-1 ${opt.highlight ? "text-primary" : "text-foreground"}`}>{opt.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{opt.tagline}</p>
                  <div className="space-y-5 flex-1">
                    <div>
                      <div className="hud-label font-bold text-muted-foreground/70 mb-3">Pros</div>
                      <ul className="space-y-2.5">
                        {opt.pros.map((p, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/80">
                            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="hud-label font-bold text-muted-foreground/70 mb-3">Cons</div>
                      <ul className="space-y-2.5">
                        {opt.cons.map((c, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/70">
                            <X className="w-4 h-4 text-destructive/70 shrink-0 mt-0.5" /> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Who should choose what */}
        <section className="py-20 px-6">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">Who Should Choose What</h2>
            </div>
            <div className="space-y-6">
              {WHO_SHOULD.map((w) => (
                <div
                  key={w.title}
                  className={`glass-card rounded-2xl p-8 border-l-4 ${w.highlight ? "border-l-primary" : "border-l-border"}`}
                >
                  <h3 className={`text-xl font-bold mb-3 ${w.highlight ? "text-primary" : "text-foreground"}`}>{w.title}</h3>
                  <p className="text-foreground/80 leading-relaxed">{w.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 bg-card/50">
          <div className="container mx-auto max-w-3xl text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Get a coach who actually sees your data
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Try RxFit.ai free for {PLAN_PRICING.kickstart.trialDays} days — AI dashboard, device sync, and a real human coach
              for {PLAN_PRICING.kickstart.perMonth} after your trial.
            </p>
            <button
              onClick={() => {
                track("cta_compare_trial_click", { plan: "kickstart", slug: "compare" });
                openSignup("kickstart");
              }}
              className="btn-primary px-8 py-4 rounded-full text-lg shadow-xl shadow-primary/20 inline-flex items-center justify-center gap-2 group"
              data-testid="button-compare-trial"
            >
              Start Your Free Trial
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 px-6">
          <div className="container mx-auto max-w-3xl">
            <div className="text-center mb-12">
              <div className="hud-label text-primary mb-3">Common Questions</div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">Comparison FAQs</h2>
            </div>
            <Accordion
              type="single"
              collapsible
              className="space-y-3"
              data-testid="compare-faq"
              onValueChange={(value) => {
                if (!value) return;
                const idx = Number(value.replace("faq-", ""));
                track("faq_open", { slug: "compare", question: COMPARE_FAQ[idx]?.q ?? value });
              }}
            >
              {COMPARE_FAQ.map((it, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="hud-corner glass-card rounded-xl border-none px-5"
                >
                  <AccordionTrigger className="text-left text-foreground hover:no-underline" data-testid={`compare-faq-question-${i}`}>
                    {it.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-foreground/80 leading-relaxed">{it.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
