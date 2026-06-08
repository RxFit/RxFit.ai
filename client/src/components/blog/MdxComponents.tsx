import React, { useState } from "react";
import { Link } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Check, Lightbulb, AlertTriangle, Info, ArrowUpRight, ChevronRight } from "lucide-react";
import { useSignupModal } from "@/components/SignupModalProvider";
import { track } from "@/lib/analytics";
import { type PlanTier } from "@shared/stripe-constants";

/* ------------------------------------------------------------------ */
/* TL;DR — top-of-post summary, optimized for AI extraction (AEO)      */
/* ------------------------------------------------------------------ */
export function TLDR({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="glass-card rounded-2xl p-6 my-8 border-l-4 border-l-teal-400"
      data-testid="blog-tldr"
    >
      <div className="text-xs font-bold text-teal-400 uppercase tracking-widest mb-3">TL;DR</div>
      <div className="text-slate-200 leading-relaxed [&>p]:mb-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Key Takeaways — orange-accented check list                          */
/* ------------------------------------------------------------------ */
export function KeyTakeaways({
  items,
  children,
}: {
  items?: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-6 my-8 bg-orange-500/5 border border-orange-500/20" data-testid="blog-key-takeaways">
      <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-4">Key Takeaways</div>
      {items ? (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-slate-200">
              <Check className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-slate-200">{children}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CTA Card — tier-aware conversion card                               */
/* ------------------------------------------------------------------ */
const PLAN_COPY: Record<PlanTier, { name: string; pitch: string; cta: string }> = {
  kickstart: {
    name: "The Kickstart",
    pitch: "Try the full AI dashboard + weekly coach check-ins free for 7 days.",
    cta: "Start your free trial",
  },
  committed: {
    name: "The Committed",
    pitch: "Go all-in for a year with priority coach access and bonus gear — save $98.",
    cta: "Claim the annual offer",
  },
  transformation: {
    name: "The Transformation",
    pitch: "1-on-1 deep-dive coaching and a full executive wellness audit.",
    cta: "Book a strategy call",
  },
};

export function CTACard({
  plan = "kickstart",
  slug,
}: {
  plan?: PlanTier;
  slug?: string;
}) {
  const { open } = useSignupModal();
  const copy = PLAN_COPY[plan];
  return (
    <div className="glass-card rounded-2xl p-8 my-10 relative overflow-hidden" data-testid={`blog-cta-${plan}`}>
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-teal-500/10 blur-3xl rounded-full" />
      <div className="relative">
        <div className="text-xs font-bold text-teal-400 uppercase tracking-widest mb-2">{copy.name}</div>
        <p className="text-lg text-white font-medium mb-6 max-w-xl">{copy.pitch}</p>
        <button
          onClick={() => {
            track("cta_inline_click", { plan, slug });
            open(plan);
          }}
          className="btn-primary px-6 py-3 rounded-xl inline-flex items-center gap-2"
          data-testid={`button-blog-cta-${plan}`}
        >
          {copy.cta}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ — accordion + FAQPage JSON-LD (required for AEO)                */
/* ------------------------------------------------------------------ */
export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
  return (
    <div className="my-10" data-testid="blog-faq">
      <h2 className="text-2xl font-bold text-white mb-6">Frequently Asked Questions</h2>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Accordion type="single" collapsible className="space-y-3">
        {items.map((it, i) => (
          <AccordionItem
            key={i}
            value={`faq-${i}`}
            className="glass-card rounded-xl border-none px-5"
          >
            <AccordionTrigger className="text-left text-white hover:no-underline" data-testid={`faq-question-${i}`}>
              {it.q}
            </AccordionTrigger>
            <AccordionContent className="text-slate-300 leading-relaxed">{it.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat — large cited number                                          */
/* ------------------------------------------------------------------ */
export function Stat({
  value,
  label,
  source,
}: {
  value: string;
  label: string;
  source?: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-6 my-8 text-center" data-testid="blog-stat">
      <div className="text-5xl font-extrabold text-gradient-teal mb-2">{value}</div>
      <div className="text-slate-300">{label}</div>
      {source && (
        <a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-teal-400 mt-3 transition-colors"
        >
          Source <ArrowUpRight className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Callout — tip / warning / info                                     */
/* ------------------------------------------------------------------ */
const CALLOUT_STYLES = {
  tip: { border: "border-l-teal-400", bg: "bg-teal-500/5", icon: Lightbulb, color: "text-teal-400", label: "Tip" },
  warning: { border: "border-l-orange-400", bg: "bg-orange-500/5", icon: AlertTriangle, color: "text-orange-400", label: "Warning" },
  info: { border: "border-l-indigo-400", bg: "bg-indigo-500/5", icon: Info, color: "text-indigo-400", label: "Note" },
} as const;

export function Callout({
  type = "info",
  children,
}: {
  type?: "tip" | "warning" | "info";
  children: React.ReactNode;
}) {
  const s = CALLOUT_STYLES[type];
  const Icon = s.icon;
  return (
    <div className={`rounded-xl p-5 my-6 border-l-4 ${s.border} ${s.bg}`} data-testid={`blog-callout-${type}`}>
      <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-2 ${s.color}`}>
        <Icon className="w-4 h-4" /> {s.label}
      </div>
      <div className="text-slate-200 leading-relaxed [&>p]:mb-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comparison — responsive table                                      */
/* ------------------------------------------------------------------ */
export function Comparison({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="glass-card rounded-2xl my-8 overflow-x-auto" data-testid="blog-comparison">
      <table className="w-full text-left border-collapse min-w-[480px]">
        <thead>
          <tr className="border-b border-white/10">
            {columns.map((c, i) => (
              <th
                key={i}
                className={`p-4 text-sm font-bold ${i === 0 ? "text-slate-400" : "text-teal-400"}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-white/5 last:border-0">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`p-4 text-sm ${ci === 0 ? "font-medium text-white" : "text-slate-300"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Element overrides                                                   */
/* ------------------------------------------------------------------ */
function AnchoredHeading({
  as: Tag,
  className,
  children,
  ...props
}: { as: "h1" | "h2" | "h3" } & React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <Tag className={`group scroll-mt-24 ${className || ""}`} {...props}>
      {children}
    </Tag>
  );
}

function SmartLink({ href = "", children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isInternal = href.startsWith("/") && !href.startsWith("//");
  if (isInternal) {
    return (
      <Link href={href} className="text-teal-400 hover:text-teal-300 underline underline-offset-2">
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-teal-400 hover:text-teal-300 underline underline-offset-2 inline-flex items-center gap-0.5"
      {...props}
    >
      {children}
    </a>
  );
}

export const mdxComponents = {
  TLDR,
  KeyTakeaways,
  CTACard,
  FAQ,
  Stat,
  Callout,
  Comparison,
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <AnchoredHeading as="h1" className="text-4xl font-extrabold text-white mt-12 mb-6" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <AnchoredHeading as="h2" className="text-3xl font-bold text-white mt-12 mb-4" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <AnchoredHeading as="h3" className="text-2xl font-bold text-white mt-8 mb-3" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-lg text-slate-300 leading-relaxed mb-6" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-outside pl-6 space-y-2 mb-6 text-lg text-slate-300 marker:text-teal-400" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-outside pl-6 space-y-2 mb-6 text-lg text-slate-300 marker:text-teal-400" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-relaxed" {...props} />,
  a: SmartLink,
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img loading="lazy" className="rounded-xl my-8 w-full h-auto border border-white/5" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="border-l-4 border-teal-400 pl-6 my-8 text-xl italic text-slate-200" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="px-1.5 py-0.5 rounded bg-slate-800 text-teal-300 text-sm font-mono" {...props} />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="rounded-xl bg-slate-900 border border-white/10 p-5 my-6 overflow-x-auto text-sm [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-slate-200" {...props} />
  ),
  hr: () => <hr className="my-10 border-white/10" />,
};
