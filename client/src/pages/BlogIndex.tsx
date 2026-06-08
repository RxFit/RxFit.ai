import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Seo } from "@/lib/seo";
import { getAllPosts, PILLARS } from "@/lib/blogLoader";

function formatDate(date: string) {
  try {
    return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return date;
  }
}

export default function BlogIndex() {
  const posts = getAllPosts();
  const [pillar, setPillar] = useState<string | null>(null);
  const filtered = pillar ? posts.filter((p) => p.frontmatter.pillar === pillar) : posts;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Seo
        title="The RxFit.ai Blog — AI Coaching, Wearables & Accountability"
        description="Evidence-based guides on AI fitness coaching, reading your wearable data, and closing the accountability gap that makes most fitness apps fail."
        canonicalPath="/blog"
        type="website"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
        ]}
      />
      <SiteHeader />

      <header className="relative pt-32 pb-16 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-teal-500/10 blur-[120px] rounded-full -z-10" />
        <div className="container mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-teal-400 text-xs font-semibold tracking-wider uppercase mb-6">
            The RxFit Journal
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6">
            Turn your data into <span className="text-gradient-teal">consistent action.</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Evidence-based guides on AI coaching, wearables, and the accountability that actually makes change stick.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mt-10">
            <button
              onClick={() => setPillar(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                pillar === null ? "bg-teal-500/20 border-teal-500/40 text-teal-300" : "border-white/10 text-slate-400 hover:text-white"
              }`}
              data-testid="chip-pillar-all"
            >
              All
            </button>
            {PILLARS.map((p) => (
              <button
                key={p}
                onClick={() => setPillar(p)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  pillar === p ? "bg-teal-500/20 border-teal-500/40 text-teal-300" : "border-white/10 text-slate-400 hover:text-white"
                }`}
                data-testid={`chip-pillar-${p.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 pb-24 max-w-6xl">
        {filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center max-w-2xl mx-auto" data-testid="blog-empty-state">
            <h2 className="text-2xl font-bold text-white mb-3">Fresh insights are on the way.</h2>
            <p className="text-slate-400 mb-6">
              We're putting the finishing touches on our first articles. In the meantime, start your
              free trial and put the science to work.
            </p>
            <Link href="/#pricing" className="btn-primary px-6 py-3 rounded-xl inline-flex items-center gap-2">
              Explore plans <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((post, i) => (
              <motion.article
                key={post.frontmatter.slug}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="glass-card glass-card-hover rounded-2xl overflow-hidden flex flex-col"
                data-testid={`card-post-${post.frontmatter.slug}`}
              >
                <Link href={`/blog/${post.frontmatter.slug}`} className="block">
                  <div className="aspect-[1200/630] bg-slate-800 overflow-hidden">
                    {post.frontmatter.heroImage && (
                      <img
                        src={post.frontmatter.heroImage}
                        alt={post.frontmatter.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                </Link>
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(post.frontmatter.tags || []).slice(0, 2).map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 text-xs font-medium border border-teal-500/20">
                        {t}
                      </span>
                    ))}
                  </div>
                  <Link href={`/blog/${post.frontmatter.slug}`}>
                    <h2 className="text-xl font-bold text-white mb-2 hover:text-teal-300 transition-colors">
                      {post.frontmatter.title}
                    </h2>
                  </Link>
                  <p className="text-slate-400 text-sm leading-relaxed mb-4 flex-1">{post.frontmatter.description}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-white/5">
                    <span>{formatDate(post.frontmatter.date)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {post.readingMinutes} min read
                    </span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
