import { Link } from "wouter";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="py-16 border-t border-white/5 bg-slate-950" data-testid="site-footer">
      <div className="container mx-auto px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <img src="/logo.png" alt="RxFit.ai" className="w-7 h-7 rounded object-cover" />
              <span className="text-lg font-bold text-white">RxFit<span className="text-teal-400">.ai</span></span>
            </Link>
            <p className="text-sm text-slate-500 leading-relaxed">
              Your AI health dashboard, paired with a real human coach. Turn your wearable
              data into daily, consistent action.
            </p>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Product</div>
            <ul className="space-y-3 text-sm text-slate-400">
              <li>
                <a href="https://app.rxfit.ai" rel="noopener" className="hover:text-teal-400 transition-colors" data-testid="link-footer-app">
                  Open the App
                </a>
              </li>
              <li><a href="/#features" className="hover:text-teal-400 transition-colors">Features</a></li>
              <li><a href="/#pricing" className="hover:text-teal-400 transition-colors">Pricing</a></li>
            </ul>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Resources</div>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><Link href="/blog" className="hover:text-teal-400 transition-colors" data-testid="link-footer-blog">Blog</Link></li>
              <li>
                <a href="https://app.rxfit.ai" rel="noopener" className="hover:text-teal-400 transition-colors">
                  Log In
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Company</div>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="#" className="hover:text-teal-400 transition-colors">Privacy</a></li>
              <li><a href="#" className="hover:text-teal-400 transition-colors">Terms</a></li>
              <li><a href="#" className="hover:text-teal-400 transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 text-center text-sm text-slate-500">
          &copy; {year} RxFit AI. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
