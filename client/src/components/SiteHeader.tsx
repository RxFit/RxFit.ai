import { Link } from "wouter";
import { useSignupModal } from "@/components/SignupModalProvider";
import ThemeToggle from "@/components/theme-toggle";

export default function SiteHeader() {
  const { open } = useSignupModal();
  return (
    <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-background/80 border-b border-border" data-testid="site-header">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="RxFit.ai" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-xl font-bold tracking-tight">RxFit<span className="text-primary">.ai</span></span>
        </Link>
        <div className="hidden md:flex items-center gap-8 hud-label text-foreground/80">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
          <a href="/#pricing" className="hover:text-foreground transition-colors">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a
            href="https://app.rxfit.ai"
            rel="noopener"
            className="hidden sm:inline-block text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
            data-testid="link-header-login"
          >
            Log In / Open App
          </a>
          <button
            onClick={() => open("kickstart")}
            className="btn-primary px-5 py-2 rounded-full text-sm font-bold shadow-lg shadow-primary/20"
            data-testid="button-header-trial"
          >
            Start Free Trial
          </button>
        </div>
      </div>
    </nav>
  );
}
