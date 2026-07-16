import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, 
  Brain, 
  Check, 
  ChevronRight, 
  Heart, 
  LayoutDashboard, 
  MessageSquare, 
  Moon,
  Dumbbell,
  Flame,
  TrendingUp,
  Users, 
  Zap
} from "lucide-react";

import heroDashboardImg from "../assets/hero-dashboard.webp";
import { useSignupModal } from "@/components/SignupModalProvider";
import SiteFooter from "@/components/SiteFooter";
import ThemeToggle from "@/components/theme-toggle";
import { Seo, SITE_URL } from "@/lib/seo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    q: "What is RxFit.ai?",
    a: "RxFit.ai is an AI-powered health coaching service that combines wearable data from devices like Oura, Garmin, and Apple Health with a dedicated human accountability coach. The AI dashboard analyzes your biometrics daily, and your coach turns that data into a specific plan and keeps you consistent.",
  },
  {
    q: "How is RxFit different from a fitness app or an AI chatbot?",
    a: "Apps and chatbots give generic advice and are easy to ignore. RxFit assigns you a real human coach who sees your actual sleep, recovery, and training data and adjusts your workouts and nutrition daily. The AI does the analysis; the human provides the judgment and accountability.",
  },
  {
    q: "Which wearables and apps does RxFit work with?",
    a: "RxFit syncs with all major wearables and health apps, including Oura, Garmin, Apple Health, Strava, and SnapCalorie. Your data is combined into a single dashboard with a daily readiness score.",
  },
  {
    q: "How much does RxFit.ai cost?",
    a: "RxFit has three plans: The Kickstart at $49/month with a 7-day free trial (AI dashboard, device sync, weekly coach check-in), The Committed at $490/year paid upfront (saves $98 and adds priority coach access), and The Transformation at $997 one-time (1-on-1 deep-dive coaching and an executive wellness audit).",
  },
  {
    q: "Is there a free trial, and can I cancel anytime?",
    a: "Yes. The Kickstart plan includes a 7-day free trial, and you can cancel your subscription at any time from the billing portal — no long-term contract or cancellation fee.",
  },
  {
    q: "Who is RxFit.ai for?",
    a: "RxFit is built for busy professionals and high-performers who already track their health data but struggle to turn it into consistent daily action. If you own a wearable and want expert direction plus real accountability without hiring a $500/month personal trainer, RxFit is designed for you.",
  },
];

const PRICING_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "RxFit.ai Health Coaching",
  description:
    "AI health dashboard plus a dedicated human accountability coach. Syncs with Oura, Garmin, Apple Health, Strava, and more.",
  brand: { "@type": "Brand", name: "RxFit.ai" },
  url: `${SITE_URL}/#pricing`,
  image: `${SITE_URL}/opengraph.jpg`,
  offers: [
    {
      "@type": "Offer",
      name: "The Kickstart",
      description: "AI dashboard access, device sync for all brands, and a weekly coach check-in. Includes a 7-day free trial.",
      price: "49.00",
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "49.00",
        priceCurrency: "USD",
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: "MON",
      },
    },
    {
      "@type": "Offer",
      name: "The Committed",
      description: "Everything in Kickstart plus priority coach access, paid annually upfront — saves $98 per year.",
      price: "490.00",
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "490.00",
        priceCurrency: "USD",
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: "ANN",
      },
    },
    {
      "@type": "Offer",
      name: "The Transformation",
      description: "One-time VIP program: 1-on-1 deep-dive strategy, executive wellness audit, daily live coaching, lifetime community access.",
      price: "997.00",
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
    },
  ],
};

const bottomLeftNotifications = [
  {
    id: "recovery",
    icon: Activity,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    label: "Recovery Score",
    value: "92%",
    badge: "↑ 4%",
    badgeColor: "text-emerald-500",
  },
  {
    id: "sleep",
    icon: Moon,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    label: "Sleep Analysis",
    value: "7.8 hrs",
    badge: "94% quality",
    badgeColor: "text-muted-foreground",
  },
  {
    id: "workout",
    icon: Dumbbell,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    label: "Today's Workout",
    value: "Upper Body Push",
    badge: "Adjusted",
    badgeColor: "text-primary",
  },
  {
    id: "resting-hr",
    icon: Heart,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    label: "Resting HR",
    value: "58 bpm",
    badge: "↓ 3 bpm",
    badgeColor: "text-emerald-500",
  },
];

const topRightNotifications = [
  {
    id: "coach-sleep",
    icon: MessageSquare,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    label: "Coach Sarah",
    value: '"Great sleep data! Let\'s push..."',
    isText: true,
  },
  {
    id: "calories",
    icon: Flame,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    label: "Daily Calories",
    value: "2,140 kcal",
    badge: "On target",
    badgeColor: "text-emerald-500",
  },
  {
    id: "coach-hrv",
    icon: MessageSquare,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    label: "Coach Sarah",
    value: '"HRV is up — time to go heavy!"',
    isText: true,
  },
  {
    id: "trend",
    icon: TrendingUp,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    label: "Weekly Trend",
    value: "Consistency: 96%",
    badge: "Personal best",
    badgeColor: "text-emerald-500",
  },
];

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
};

export default function LandingPage() {
  const { open: openSignup } = useSignupModal();
  const [blIndex, setBlIndex] = useState(0);
  const [trIndex, setTrIndex] = useState(0);

  useEffect(() => {
    const blInterval = setInterval(() => {
      setBlIndex((prev) => (prev + 1) % bottomLeftNotifications.length);
    }, 3500);
    const trInterval = setInterval(() => {
      setTrIndex((prev) => (prev + 1) % topRightNotifications.length);
    }, 4200);
    return () => { clearInterval(blInterval); clearInterval(trInterval); };
  }, []);

  const currentBottomLeft = bottomLeftNotifications[blIndex];
  const currentTopRight = topRightNotifications[trIndex];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/30 selection:text-primary-foreground">
      <Seo
        title="RxFit.ai — AI Health Dashboard + Human Accountability Coach"
        description="Turn your wearable data into daily, consistent action. RxFit.ai pairs an AI health dashboard with a real human accountability coach."
        canonicalPath="/"
        image="/opengraph.jpg"
        jsonLd={[
          PRICING_JSONLD,
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((it) => ({
              "@type": "Question",
              name: it.q,
              acceptedAnswer: { "@type": "Answer", text: it.a },
            })),
          },
        ]}
      />

      {/* Sticky Navbar */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="RxFit.ai" className="w-8 h-8 rounded-lg object-cover" />
            <span className="text-xl font-bold tracking-tight">RxFit<span className="text-primary">.ai</span></span>
          </a>
          <div className="hidden md:flex items-center gap-8 hud-label text-foreground/80">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="/blog" className="hover:text-foreground transition-colors" data-testid="link-nav-blog">Blog</a>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href="https://app.rxfit.ai"
              rel="noopener"
              className="hidden sm:inline-block text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
              data-testid="link-nav-login"
            >
              Log In
            </a>
            <button
              onClick={() => openSignup("kickstart")}
              className="btn-primary px-5 py-2 rounded-full text-sm font-bold shadow-lg shadow-primary/20"
              data-testid="button-nav-trial"
            >
              Start Free Trial
            </button>
          </div>
        </div>
      </nav>

      {/* Main content landmark — wraps hero through testimonial, outside nav and footer */}
      <main>

      {/* Hero Section */}
      <header className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/10 blur-[120px] rounded-full -z-10" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-primary/5 blur-[100px] rounded-full -z-10" />

        <div className="container mx-auto text-center max-w-5xl relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
          >
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-foreground/5 border border-border text-primary hud-label mb-4">
              <Zap className="w-3 h-3 fill-primary" />
              The Future of Personal Health
            </motion.div>
            
            <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight text-foreground">
              Your AI Health Dashboard.<br />
              <span className="text-gradient-teal">Your Human Coach.</span>
            </motion.h1>
            
            <motion.p variants={fadeIn} className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Stop guessing. <span className="text-foreground font-medium">RxFit.ai</span> syncs with your devices and connects you to a real human coach to turn your data into daily, consistent action.
            </motion.p>

            <motion.p variants={fadeIn} className="text-sm text-muted-foreground/80 max-w-2xl mx-auto leading-relaxed" data-testid="text-hero-definition">
              RxFit.ai is an AI-powered health coaching service that combines wearable data from Oura, Garmin, and Apple Health with a dedicated human coach — from $49/month with a 7-day free trial.
            </motion.p>
            
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => openSignup("kickstart")}
                className="btn-primary w-full sm:w-auto px-8 py-4 rounded-full text-lg shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group"
                data-testid="button-hero-trial"
              >
                Start Your Free Trial
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#features"
                className="w-full sm:w-auto px-8 py-4 rounded-full text-lg font-medium text-foreground/80 hover:text-foreground border border-border hover:border-foreground/20 hover:bg-foreground/5 transition-all flex items-center justify-center gap-2"
                data-testid="link-how-it-works"
              >
                See How It Works
              </a>
            </motion.div>
            
            <motion.div variants={fadeIn} className="pt-16 relative">
               <div className="hud-corner hud-scanline hud-glow-box relative mx-auto max-w-4xl rounded-xl border border-border shadow-2xl shadow-primary/20 bg-card/50 backdrop-blur-sm overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
                 <img 
                   src={heroDashboardImg} 
                   alt="RxFit AI Dashboard" 
                   fetchPriority="high"
                   decoding="sync"
                   width={1200}
                   height={750}
                   className="w-full h-auto object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                 />
                 
                 <div className="absolute bottom-6 left-6 md:bottom-10 md:left-10 z-20">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`bl-${currentBottomLeft.id}`}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.5 }}
                        className="glass-card p-4 rounded-lg flex items-center gap-3"
                      >
                        <div className={`w-10 h-10 rounded-full ${currentBottomLeft.iconBg} flex items-center justify-center ${currentBottomLeft.iconColor}`}>
                          <currentBottomLeft.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="hud-label text-muted-foreground">{currentBottomLeft.label}</div>
                          <div className="text-lg font-bold text-foreground" data-testid="text-hero-notif-bl">
                            {currentBottomLeft.value}
                            {currentBottomLeft.badge && <span className={`text-xs font-normal ${currentBottomLeft.badgeColor} ml-1`}>{currentBottomLeft.badge}</span>}
                          </div>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                 </div>

                 <div className="absolute top-6 right-6 md:top-10 md:right-10 z-20">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`tr-${currentTopRight.id}`}
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.5 }}
                        className="glass-card p-4 rounded-lg flex items-center gap-3"
                      >
                        <div className={`w-10 h-10 rounded-full ${currentTopRight.iconBg} flex items-center justify-center ${currentTopRight.iconColor}`}>
                          <currentTopRight.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="hud-label text-muted-foreground">{currentTopRight.label}</div>
                          {currentTopRight.isText ? (
                            <div className="text-sm font-bold text-foreground max-w-[200px]">{currentTopRight.value}</div>
                          ) : (
                            <div className="text-lg font-bold text-foreground" data-testid="text-hero-notif-tr">
                              {currentTopRight.value}
                              {currentTopRight.badge && <span className={`text-xs font-normal ${currentTopRight.badgeColor} ml-1`}>{currentTopRight.badge}</span>}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                 </div>
               </div>
            </motion.div>
          </motion.div>
        </div>
      </header>

      {/* Social Proof */}
      <section className="py-10 border-y border-border bg-muted/30">
        <div className="container mx-auto px-6 text-center">
          <p className="hud-label text-muted-foreground/70 mb-8">Works seamlessly with your favorite gear</p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
             <span className="text-xl font-bold text-foreground">OURA</span>
             <span className="text-xl font-bold text-foreground">GARMIN</span>
             <span className="text-xl font-bold text-foreground">SnapCalorie</span>
             <span className="text-xl font-bold text-foreground">Apple Health</span>
             <span className="text-xl font-bold text-foreground">STRAVA</span>
          </div>
        </div>
      </section>

      {/* The Problem (Agitation) */}
      <section className="py-24 relative">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">Why do most high-performers fail?</h2>
          <p className="text-lg text-muted-foreground mb-16 max-w-2xl mx-auto">
            It's not lack of effort. It's the cycle of <span className="text-primary">information overload</span> and <span className="text-primary">isolation</span>.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-foreground/5 border border-border hover:border-border transition-colors text-left">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Data without Direction</h3>
              <p className="text-muted-foreground">You have 10,000 data points from your watch, but no idea what to actually <em>do</em> today.</p>
            </div>
            <div className="p-8 rounded-2xl bg-foreground/5 border border-border hover:border-border transition-colors text-left">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Decision Fatigue</h3>
              <p className="text-muted-foreground">Trying to be the nutritionist, trainer, and data analyst while running your business.</p>
            </div>
            <div className="p-8 rounded-2xl bg-foreground/5 border border-border hover:border-border transition-colors text-left">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Isolation</h3>
              <p className="text-muted-foreground">Apps can't keep you accountable. When things get tough, it's easy to ignore a notification.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The Solution (The RxFit Way) */}
      <section id="features" className="py-24 relative overflow-hidden bg-card/50">
         <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full -z-10" />
         
         <div className="container mx-auto px-6">
            <div className="text-center mb-16">
               <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">The <span className="text-primary">RxFit</span> Way</h2>
               <p className="text-muted-foreground">From overwhelmed to optimized in three steps.</p>
            </div>

            <div className="space-y-24">
               {/* Feature 1 */}
               <div className="flex flex-col md:flex-row items-center gap-12">
                  <div className="flex-1 space-y-6">
                     <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                        <LayoutDashboard className="w-6 h-6" />
                     </div>
                     <h3 className="text-3xl font-bold text-foreground">Centralized AI Hub</h3>
                     <p className="text-lg text-muted-foreground leading-relaxed">
                        We integrate with Apple Health, Oura, Garmin, and more to create a single source of truth. Our AI analyzes your biometrics to find patterns you'd miss.
                     </p>
                     <ul className="space-y-3">
                        <li className="flex items-center gap-3 text-foreground/80">
                           <Check className="w-5 h-5 text-primary" /> Auto-syncs with all major wearables
                        </li>
                        <li className="flex items-center gap-3 text-foreground/80">
                           <Check className="w-5 h-5 text-primary" /> Daily Readiness Score
                        </li>
                     </ul>
                  </div>
                  <div className="flex-1 relative">
                     <div className="glass-card p-1 rounded-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
                        <img src="/ai-visualization.webp" loading="lazy" decoding="async" width={800} height={534} alt="AI Health Data Visualization" className="rounded-xl w-full h-auto object-cover border border-border" />
                     </div>
                  </div>
               </div>

               {/* Feature 2 */}
               <div className="flex flex-col md:flex-row-reverse items-center gap-12">
                  <div className="flex-1 space-y-6">
                     <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                        <Users className="w-6 h-6" />
                     </div>
                     <h3 className="text-3xl font-bold text-foreground">Real Human Touch</h3>
                     <p className="text-lg text-muted-foreground leading-relaxed">
                        Not a chatbot. A dedicated coach who sees your data and adjusts your plan daily. They know when to push you and when to tell you to rest.
                     </p>
                     <ul className="space-y-3">
                        <li className="flex items-center gap-3 text-foreground/80">
                           <Check className="w-5 h-5 text-primary" /> Daily human check-ins
                        </li>
                        <li className="flex items-center gap-3 text-foreground/80">
                           <Check className="w-5 h-5 text-primary" /> Custom workout & nutrition adjustments
                        </li>
                     </ul>
                  </div>
                  <div className="flex-1 relative">
                     <div className="glass-card p-1 rounded-2xl -rotate-3 hover:rotate-0 transition-transform duration-500">
                        <img src="/coach-interface.webp" loading="lazy" decoding="async" width={800} height={534} alt="Coach reviewing health data with client" className="rounded-xl w-full h-auto object-cover border border-border" />
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </section>

      {/* Pricing Section (The Value Stack) */}
      <section id="pricing" className="py-24 relative">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-[400px] bg-primary/5 blur-[100px] rounded-full -z-10" />

         <div className="container mx-auto px-6">
            <div className="text-center mb-16">
               <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Simple, Transparent Investment</h2>
               <p className="text-muted-foreground">Choose the level of accountability you need.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
               
               {/* Tier 1: Kickstart */}
               <div className="hud-corner glass-card rounded-3xl p-8 flex flex-col glass-card-hover relative group">
                  <div className="mb-6">
                     <h3 className="text-xl font-medium text-foreground/80 mb-2">The Kickstart</h3>
                     <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-foreground" data-testid="text-price-kickstart">$49</span>
                        <span className="text-muted-foreground/70">/mo</span>
                     </div>
                     <div className="mt-4 inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                        7-Day Free Trial
                     </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1">
                     <li className="flex items-start gap-3 text-foreground/80 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> AI Dashboard Access
                     </li>
                     <li className="flex items-start gap-3 text-foreground/80 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> Device Sync (All brands)
                     </li>
                     <li className="flex items-start gap-3 text-foreground/80 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> Weekly Coach Check-in
                     </li>
                  </ul>
                  <button
                    onClick={() => openSignup("kickstart")}
                    className="w-full py-3 rounded-xl border border-border hover:bg-foreground/5 text-foreground font-medium transition-colors"
                    data-testid="button-signup-kickstart"
                  >
                     Start Free Trial
                  </button>
               </div>

               {/* Tier 2: The Committed (Best Value) */}
               <div className="hud-corner hud-glow-box glass-card rounded-3xl p-1 flex flex-col relative transform md:-translate-y-4 z-10">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-primary to-[hsl(43_55%_62%)] text-primary-foreground px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider hud-label shadow-lg">
                     Best Value
                  </div>
                  <div className="bg-card rounded-[22px] p-8 h-full flex flex-col">
                     <div className="mb-6">
                        <h3 className="text-xl font-bold text-foreground mb-2">The Committed</h3>
                        <div className="flex items-baseline gap-1">
                           <span className="text-5xl font-bold text-foreground" data-testid="text-price-committed">$490</span>
                           <span className="text-muted-foreground/70">/yr</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Paid upfront. Save $98/year.</p>
                     </div>
                     
                     <div className="space-y-6 mb-8 flex-1">
                        <div className="space-y-3">
                           <div className="hud-label font-bold text-muted-foreground/70">Core Features</div>
                           <ul className="space-y-3">
                              <li className="flex items-start gap-3 text-foreground/80 text-sm">
                                 <Check className="w-5 h-5 text-primary shrink-0" /> Everything in Kickstart
                              </li>
                              <li className="flex items-start gap-3 text-foreground/80 text-sm">
                                 <Check className="w-5 h-5 text-primary shrink-0" /> Priority Coach Access
                              </li>
                           </ul>
                        </div>

                        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                           <div className="hud-label font-bold text-primary mb-3">Included Bonuses</div>
                           <ul className="space-y-3">
                              <li className="flex items-start gap-3 text-foreground text-sm font-medium">
                                 <Check className="w-5 h-5 text-primary shrink-0" /> $150 Value for Garmin HRM
                              </li>
                              <li className="flex items-start gap-3 text-foreground text-sm font-medium">
                                 <Check className="w-5 h-5 text-primary shrink-0" /> Live Audit w/ Licensed Nutritionist
                              </li>
                           </ul>
                        </div>
                     </div>

                     <button
                       onClick={() => openSignup("committed")}
                       className="btn-secondary w-full py-4 rounded-xl shadow-lg shadow-primary/20"
                       data-testid="button-signup-committed"
                     >
                        Claim Annual Offer
                     </button>
                  </div>
               </div>

               {/* Tier 3: Transformation */}
               <div className="hud-corner glass-card rounded-3xl p-8 flex flex-col glass-card-hover relative group">
                  <div className="mb-6">
                     <h3 className="text-xl font-medium text-foreground/80 mb-2">The Transformation</h3>
                     <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-foreground" data-testid="text-price-transformation">$997</span>
                        <span className="text-muted-foreground/70">/one-time</span>
                     </div>
                     <div className="mt-4 inline-block px-3 py-1 rounded-full bg-muted text-foreground/80 text-xs font-bold border border-border">
                        VIP Access
                     </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1">
                     <li className="flex items-start gap-3 text-foreground/80 text-sm">
                        <Check className="w-5 h-5 text-foreground shrink-0" /> 1-on-1 Deep Dive Strategy
                     </li>
                     <li className="flex items-start gap-3 text-foreground/80 text-sm">
                        <Check className="w-5 h-5 text-foreground shrink-0" /> Executive Wellness Audit
                     </li>
                     <li className="flex items-start gap-3 text-foreground/80 text-sm">
                        <Check className="w-5 h-5 text-foreground shrink-0" /> Daily Live Coaching Interaction
                     </li>
                     <li className="flex items-start gap-3 text-foreground/80 text-sm">
                        <Check className="w-5 h-5 text-foreground shrink-0" /> Lifetime Community Access
                     </li>
                  </ul>
                  <button
                    onClick={() => openSignup("transformation")}
                    className="w-full py-3 rounded-xl border border-border hover:bg-foreground/5 text-foreground font-medium transition-colors"
                    data-testid="button-signup-transformation"
                  >
                     Book a Strategy Call
                  </button>
               </div>

            </div>
         </div>
      </section>

      {/* Testimonial Section */}
      <section className="py-24 bg-card/50">
        <div className="container mx-auto px-6 max-w-4xl">
           <div className="glass-card p-10 rounded-2xl relative">
              <div className="absolute -top-6 -left-6 text-6xl text-primary/20 font-serif">"</div>
              <p className="text-2xl text-foreground leading-relaxed text-center italic mb-8">
                 "I've tried every app out there. RxFit is different because <span className="text-primary font-bold">my coach actually sees the data</span>. When I had a bad sleep week, she adjusted my workouts automatically. That consistency changed everything."
              </p>
              <div className="flex items-center justify-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-muted" />
                 <div className="text-left">
                    <div className="font-bold text-foreground">Michael R.</div>
                    <div className="text-sm text-muted-foreground/70">Software Executive</div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[300px] bg-primary/5 blur-[100px] rounded-full -z-10" />
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="text-center mb-12">
            <div className="hud-label text-primary mb-3">Common Questions</div>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3" data-testid="landing-faq">
            {FAQ_ITEMS.map((it, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="hud-corner glass-card rounded-xl border-none px-5"
              >
                <AccordionTrigger className="text-left text-foreground hover:no-underline" data-testid={`landing-faq-question-${i}`}>
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
