import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  mdxComponents,
  TLDR,
  KeyTakeaways,
  CTACard,
  FAQ,
} from "@/components/blog/MdxComponents";
import { slugifyHeading, splitBodyForCta } from "@shared/generated-blog";
import type { GeneratedPostFull } from "@/lib/generatedPosts";
import type { PlanTier } from "@shared/stripe-constants";

/**
 * Renders a DB-backed (AI-generated) post body with the exact same visual
 * language as the MDX posts: markdown body through the shared element
 * overrides, plus the TLDR / KeyTakeaways / CTACard / FAQ brand blocks.
 *
 * Heading ids are assigned with the same slugify + dedupe algorithm used at
 * generation time so the stored TOC anchors always match.
 */

type MarkdownComponents = NonNullable<React.ComponentProps<typeof ReactMarkdown>["components"]>;

function childText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childText).join("");
  if (children && typeof children === "object" && "props" in (children as any)) {
    return childText((children as any).props?.children);
  }
  return "";
}

function buildComponents(seen: Map<string, number>): MarkdownComponents {
  const H2 = mdxComponents.h2;
  return {
    h1: mdxComponents.h2, // never allow a second H1 on the page
    h2: ({ children, ...props }) => {
      const text = childText(children);
      let id = slugifyHeading(text);
      const count = seen.get(id);
      if (count !== undefined) {
        seen.set(id, count + 1);
        id = `${id}-${count + 1}`;
      } else {
        seen.set(id, 0);
      }
      return (
        <H2 id={id} {...props}>
          {children}
        </H2>
      );
    },
    h3: mdxComponents.h3,
    p: mdxComponents.p,
    ul: mdxComponents.ul,
    ol: mdxComponents.ol,
    li: mdxComponents.li,
    a: mdxComponents.a as MarkdownComponents["a"],
    img: mdxComponents.img,
    blockquote: mdxComponents.blockquote,
    code: mdxComponents.code,
    pre: mdxComponents.pre,
    hr: mdxComponents.hr,
  };
}

export default function GeneratedPostContent({ post }: { post: GeneratedPostFull }) {
  const [firstHalf, secondHalf] = useMemo(
    () => splitBodyForCta(post.bodyMarkdown),
    [post.bodyMarkdown],
  );

  // One shared dedupe map across both halves so ids match the stored TOC.
  const seen = new Map<string, number>();
  const componentsA = buildComponents(seen);
  const componentsB = buildComponents(seen);
  const plan = (post.recommendedPlan || "kickstart") as PlanTier;

  return (
    <>
      <TLDR>
        <p>{post.tldr}</p>
      </TLDR>

      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsA}>
        {firstHalf}
      </ReactMarkdown>

      {secondHalf && (
        <>
          <CTACard plan={plan} slug={post.slug} />
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsB}>
            {secondHalf}
          </ReactMarkdown>
        </>
      )}

      {post.keyTakeaways.length > 0 && <KeyTakeaways items={post.keyTakeaways} />}
      {post.faq.length > 0 && <FAQ items={post.faq} />}
    </>
  );
}
