import { Link } from "wouter";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="py-16 border-t border-border bg-card" data-testid="site-footer">
      <div className="container mx-auto px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <img src="/logo.png" alt="RxFit.ai" className="w-7 h-7 rounded object-cover" />
              <span className="text-lg font-bold text-foreground">RxFit<span className="text-primary">.ai</span></span>
            </Link>
            <p className="text-sm text-muted-foreground/70 leading-relaxed">
              Your AI health dashboard, paired with a real human coach. Turn your wearable
              data into daily, consistent action.
            </p>
          </div>

          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Product</div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <a href="https://app.rxfit.ai" rel="noopener" className="hover:text-primary transition-colors" data-testid="link-footer-app">
                  Open the App
                </a>
              </li>
              <li><a href="/#features" className="hover:text-primary transition-colors">Features</a></li>
              <li><a href="/#pricing" className="hover:text-primary transition-colors">Pricing</a></li>
            </ul>
          </div>

          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Resources</div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/blog" className="hover:text-primary transition-colors" data-testid="link-footer-blog">Blog</Link></li>
              <li>
                <a href="https://app.rxfit.ai" rel="noopener" className="hover:text-primary transition-colors">
                  Log In
                </a>
              </li>
            </ul>
          </div>

          <nav aria-label="Company">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Company</div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-primary transition-colors" data-testid="link-footer-privacy">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors" data-testid="link-footer-terms">Terms</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors" data-testid="link-footer-contact">Contact</Link></li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground/70">
          &copy; {year} RxFit AI. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
