import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Seo } from "@/lib/seo";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground px-6 text-center">
      <Seo
        title="Page not found | RxFit.ai"
        description="The page you were looking for doesn't exist."
        canonicalPath="/404"
        noindex
      />
      <div className="flex items-center gap-3 mb-4">
        <AlertCircle className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">404 — Page not found</h1>
      </div>
      <p className="text-muted-foreground max-w-md mb-8">
        The page you were looking for doesn't exist or may have moved.
      </p>
      <Link
        href="/"
        className="btn-primary px-6 py-3 rounded-xl inline-flex items-center gap-2"
        data-testid="link-home"
      >
        <ArrowLeft className="w-5 h-5" /> Back to homepage
      </Link>
    </div>
  );
}
