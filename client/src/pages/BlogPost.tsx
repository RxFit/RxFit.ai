import { useEffect, useMemo } from "react";
import { Link, useRoute } from "wouter";
import { MDXProvider } from "@mdx-js/react";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import StickyFooterCta from "@/components/blog/StickyFooterCta";
import ExitIntentModal from "@/components/blog/ExitIntentModal";
import { mdxComponents, CTACard } from "@/components/blog/MdxComponents";
import { Seo, APP_URL } from "@/lib/seo";
import { getPostBySlug, getRelatedPosts } from "@/lib/blogLoader";
import { track } from "@/lib/analytics";
import { appendUtm } from "@/lib/utm";

function formatDate(date: string) {
  try {
    return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return date;
  }
}

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug || "";
  const post = getPostBySlug(slug);
  const toc = post?.toc ?? [];
  const related = useMemo(
    () => (post ? getRelatedPosts(slug, post.frontmatter.pillar) : []),
    [slug, post],
  );

  useEffect(() => {
    if (!post) return;
    track("pageview", { slug });
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
          track("scroll_50", { slug });
        }
        if (!fired90 && pct >= 0.9) {
          fired90 = true;
          track("scroll_90", { slug });
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [slug, post]);

  if (!post) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Post not found</h1>
          <p className="text-slate-400 mb-8">We couldn't find the article you were looking for.</p>
          <Link href="/blog" className="btn-primary px-6 py-3 rounded-xl inline-flex items-center gap-2">
            <ArrowLeft className="w-5 h-5" /> Back to the blog
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const { frontmatter: fm, Component, readingMinutes } = post;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Seo
        title={`${fm.title} | RxFit.ai`}
        description={fm.description}
        canonicalPath={`/blog/${fm.slug}`}
        type="article"
        image={fm.heroImage}
        article={{ publishedTime: fm.date, author: fm.author, tags: fm.tags }}
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: fm.title, path: `/blog/${fm.slug}` },
        ]}
      />
      <SiteHeader />

      <article className="pt-28 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          {/* Breadcrumb */}
          <nav className="text-sm text-slate-500 mb-8 flex items-center gap-2" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-teal-400">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-teal-400">Blog</Link>
            <span>/</span>
            <span className="text-slate-300">{fm.pillar}</span>
          </nav>

          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2 mb-4">
              {(fm.tags || []).map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 text-xs font-medium border border-teal-500/20">
                  {t}
                </span>
              ))}
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight mb-6">
              {fm.title}
            </h1>
            <div className="flex items-center gap-4 text-sm text-slate-400 mb-8">
              {fm.authorPhoto ? (
                <img src={fm.authorPhoto} alt={fm.author} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-700" />
              )}
              <div>
                <div className="text-white font-medium">{fm.author}</div>
                <div className="flex items-center gap-3">
                  <span>{formatDate(fm.date)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {readingMinutes} min read
                  </span>
                </div>
              </div>
            </div>
          </div>

          {fm.heroImage && (
            <div className="rounded-2xl overflow-hidden border border-white/10 mb-12 max-w-4xl">
              <img src={fm.heroImage} alt={fm.title} className="w-full h-auto object-cover" />
            </div>
          )}

          <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-12">
            {/* Content */}
            <div className="max-w-3xl min-w-0" data-testid="blog-post-content">
              <MDXProvider components={mdxComponents}>
                <Component />
              </MDXProvider>

              {/* Author bio + contextual app link */}
              <div className="glass-card rounded-2xl p-6 mt-12 flex gap-4 items-start" data-testid="blog-author-bio">
                {fm.authorPhoto ? (
                  <img src={fm.authorPhoto} alt={fm.author} className="w-14 h-14 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-700 shrink-0" />
                )}
                <div>
                  <div className="text-white font-bold mb-1">{fm.author}</div>
                  <p className="text-sm text-slate-400 leading-relaxed mb-2">{fm.authorBio}</p>
                  <a
                    href={appendUtm(APP_URL, fm.slug)}
                    rel="noopener"
                    className="text-sm text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"
                    data-testid="link-bio-app"
                  >
                    Open the RxFit web app <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {fm.recommendedPlan && (
                <CTACard plan={fm.recommendedPlan} slug={fm.slug} />
              )}
            </div>

            {/* Sticky TOC (desktop) */}
            {toc.length > 0 && (
              <aside className="hidden lg:block">
                <div className="sticky top-24">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">On this page</div>
                  <ul className="space-y-2 text-sm border-l border-white/10">
                    {toc.map((h) => (
                      <li key={h.id}>
                        <a
                          href={`#${h.id}`}
                          className="block pl-4 -ml-px border-l border-transparent hover:border-teal-400 text-slate-400 hover:text-teal-300 transition-colors"
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
          </div>

          {/* Related posts */}
          {related.length > 0 && (
            <div className="max-w-5xl mt-20">
              <h2 className="text-2xl font-bold text-white mb-6">Related reading</h2>
              <div className="grid gap-6 md:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.frontmatter.slug}
                    href={`/blog/${r.frontmatter.slug}`}
                    className="glass-card glass-card-hover rounded-2xl p-6 block"
                    data-testid={`card-related-${r.frontmatter.slug}`}
                  >
                    <div className="text-xs text-teal-400 mb-2">{r.frontmatter.pillar}</div>
                    <div className="text-white font-bold mb-2">{r.frontmatter.title}</div>
                    <div className="text-sm text-slate-400 line-clamp-2">{r.frontmatter.description}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>

      <SiteFooter />
      <StickyFooterCta slug={fm.slug} />
      <ExitIntentModal slug={fm.slug} />
    </div>
  );
}
