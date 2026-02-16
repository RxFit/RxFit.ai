import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { 
  Activity, 
  Brain, 
  Check, 
  ChevronRight, 
  Heart, 
  LayoutDashboard, 
  MessageSquare, 
  Users, 
  Zap,
  X,
  Loader2
} from "lucide-react";

import heroDashboardImg from "../assets/hero-dashboard.png";

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

function SignupModal({ isOpen, onClose, plan }: { isOpen: boolean; onClose: () => void; plan: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const mutation = useMutation({
    mutationFn: async (data: { email: string; name: string; plan: string }) => {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 200) throw new Error(json.message);
      return json;
    },
    onSuccess: () => {
      setSuccess(true);
      setErrorMsg("");
    },
    onError: (err: Error) => {
      setErrorMsg(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    mutation.mutate({ email, name, plan });
  };

  const planLabels: Record<string, string> = {
    kickstart: "The Kickstart — 7-Day Free Trial",
    committed: "The Committed — Annual Plan",
    transformation: "The Transformation — VIP Access",
  };

  const handleClose = () => {
    setSuccess(false);
    setEmail("");
    setName("");
    setErrorMsg("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3 }}
            className="glass-card rounded-2xl p-8 w-full max-w-md relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white transition-colors"
              data-testid="button-close-modal"
            >
              <X className="w-5 h-5" />
            </button>

            {success ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 mx-auto mb-4">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">You're in!</h3>
                <p className="text-slate-400" data-testid="text-success-message">Check your email for next steps to get started with RxFit.ai.</p>
                <button
                  onClick={handleClose}
                  className="mt-6 btn-primary px-6 py-3 rounded-full text-sm"
                  data-testid="button-close-success"
                >
                  Got it
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">Get Started with RxFit.ai</h3>
                  <p className="text-sm text-slate-400">{planLabels[plan] || plan}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      data-testid="input-name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@email.com"
                      className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      data-testid="input-email"
                    />
                  </div>

                  {errorMsg && (
                    <p className="text-sm text-red-400" data-testid="text-error">{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="w-full btn-primary py-4 rounded-xl text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    data-testid="button-submit-signup"
                  >
                    {mutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        {plan === "transformation" ? "Request Strategy Call" : "Start Free Trial"}
                        <ChevronRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("kickstart");

  const openSignup = (plan: string) => {
    setSelectedPlan(plan);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-teal-500/30 selection:text-teal-200">
      
      <SignupModal isOpen={modalOpen} onClose={() => setModalOpen(false)} plan={selectedPlan} />

      {/* Sticky Navbar */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-background/80 border-b border-white/5">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-slate-900 font-bold">
              Rx
            </div>
            <span className="text-xl font-bold tracking-tight">RxFit<span className="text-teal-400">.ai</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <button
            onClick={() => openSignup("kickstart")}
            className="btn-primary px-5 py-2 rounded-full text-sm font-bold shadow-lg shadow-teal-500/20"
            data-testid="button-nav-trial"
          >
            Start Free Trial
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-teal-500/10 blur-[120px] rounded-full -z-10" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-orange-500/5 blur-[100px] rounded-full -z-10" />

        <div className="container mx-auto text-center max-w-5xl relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
          >
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-teal-400 text-xs font-semibold tracking-wider uppercase mb-4">
              <Zap className="w-3 h-3 fill-teal-400" />
              The Future of Personal Health
            </motion.div>
            
            <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight text-white">
              Your AI Health Dashboard.<br />
              <span className="text-gradient-teal">Your Human Coach.</span>
            </motion.h1>
            
            <motion.p variants={fadeIn} className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Stop guessing. <span className="text-white font-medium">RxFit.ai</span> syncs with your devices and connects you to a real human coach to turn your data into daily, consistent action.
            </motion.p>
            
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => openSignup("kickstart")}
                className="btn-primary w-full sm:w-auto px-8 py-4 rounded-full text-lg shadow-xl shadow-teal-500/20 flex items-center justify-center gap-2 group"
                data-testid="button-hero-trial"
              >
                Start Your Free Trial
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#features"
                className="w-full sm:w-auto px-8 py-4 rounded-full text-lg font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                data-testid="link-how-it-works"
              >
                See How It Works
              </a>
            </motion.div>
            
            <motion.div variants={fadeIn} className="pt-16 relative">
               <div className="relative mx-auto max-w-4xl rounded-xl border border-white/10 shadow-2xl shadow-teal-900/50 bg-slate-900/50 backdrop-blur-sm overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-10" />
                 <img 
                   src={heroDashboardImg} 
                   alt="RxFit AI Dashboard" 
                   className="w-full h-auto object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                 />
                 
                 <div className="absolute bottom-10 left-10 z-20 glass-card p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Recovery Score</div>
                      <div className="text-lg font-bold text-white" data-testid="text-recovery-score">92% <span className="text-xs font-normal text-emerald-400">↑ 4%</span></div>
                    </div>
                 </div>

                 <div className="absolute top-10 right-10 z-20 glass-card p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-1000 delay-500">
                    <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Coach Sarah</div>
                      <div className="text-sm font-bold text-white">"Great sleep data! Let's push..."</div>
                    </div>
                 </div>
               </div>
            </motion.div>
          </motion.div>
        </div>
      </header>

      {/* Social Proof */}
      <section className="py-10 border-y border-white/5 bg-slate-900/30">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mb-8">Works seamlessly with your favorite gear</p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
             <span className="text-xl font-bold text-white">OURA</span>
             <span className="text-xl font-bold text-white">GARMIN</span>
             <span className="text-xl font-bold text-white">SnapCalorie</span>
             <span className="text-xl font-bold text-white">Apple Health</span>
             <span className="text-xl font-bold text-white">STRAVA</span>
          </div>
        </div>
      </section>

      {/* The Problem (Agitation) */}
      <section className="py-24 relative">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Why do most high-performers fail?</h2>
          <p className="text-lg text-slate-400 mb-16 max-w-2xl mx-auto">
            It's not lack of effort. It's the cycle of <span className="text-orange-400">information overload</span> and <span className="text-orange-400">isolation</span>.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors text-left">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-4">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Data without Direction</h3>
              <p className="text-slate-400">You have 10,000 data points from your watch, but no idea what to actually <em>do</em> today.</p>
            </div>
            <div className="p-8 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors text-left">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-4">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Decision Fatigue</h3>
              <p className="text-slate-400">Trying to be the nutritionist, trainer, and data analyst while running your business.</p>
            </div>
            <div className="p-8 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors text-left">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Isolation</h3>
              <p className="text-slate-400">Apps can't keep you accountable. When things get tough, it's easy to ignore a notification.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The Solution (The RxFit Way) */}
      <section id="features" className="py-24 relative overflow-hidden bg-slate-900/50">
         <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-teal-500/5 blur-[120px] rounded-full -z-10" />
         
         <div className="container mx-auto px-6">
            <div className="text-center mb-16">
               <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">The <span className="text-teal-400">RxFit</span> Way</h2>
               <p className="text-slate-400">From overwhelmed to optimized in three steps.</p>
            </div>

            <div className="space-y-24">
               {/* Feature 1 */}
               <div className="flex flex-col md:flex-row items-center gap-12">
                  <div className="flex-1 space-y-6">
                     <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/20">
                        <LayoutDashboard className="w-6 h-6" />
                     </div>
                     <h3 className="text-3xl font-bold text-white">Centralized AI Hub</h3>
                     <p className="text-lg text-slate-400 leading-relaxed">
                        We integrate with Apple Health, Oura, Garmin, and more to create a single source of truth. Our AI analyzes your biometrics to find patterns you'd miss.
                     </p>
                     <ul className="space-y-3">
                        <li className="flex items-center gap-3 text-slate-300">
                           <Check className="w-5 h-5 text-teal-400" /> Auto-syncs with all major wearables
                        </li>
                        <li className="flex items-center gap-3 text-slate-300">
                           <Check className="w-5 h-5 text-teal-400" /> Daily Readiness Score
                        </li>
                     </ul>
                  </div>
                  <div className="flex-1 relative">
                     <div className="glass-card p-1 rounded-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
                        <div className="bg-slate-900/80 rounded-xl p-8 h-64 flex items-center justify-center border border-white/5">
                           <span className="text-slate-600 font-mono">AI Visualization Placeholder</span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Feature 2 */}
               <div className="flex flex-col md:flex-row-reverse items-center gap-12">
                  <div className="flex-1 space-y-6">
                     <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 border border-orange-500/20">
                        <Users className="w-6 h-6" />
                     </div>
                     <h3 className="text-3xl font-bold text-white">Real Human Touch</h3>
                     <p className="text-lg text-slate-400 leading-relaxed">
                        Not a chatbot. A dedicated coach who sees your data and adjusts your plan daily. They know when to push you and when to tell you to rest.
                     </p>
                     <ul className="space-y-3">
                        <li className="flex items-center gap-3 text-slate-300">
                           <Check className="w-5 h-5 text-orange-400" /> Daily human check-ins
                        </li>
                        <li className="flex items-center gap-3 text-slate-300">
                           <Check className="w-5 h-5 text-orange-400" /> Custom workout & nutrition adjustments
                        </li>
                     </ul>
                  </div>
                  <div className="flex-1 relative">
                     <div className="glass-card p-1 rounded-2xl -rotate-3 hover:rotate-0 transition-transform duration-500">
                        <div className="bg-slate-900/80 rounded-xl p-8 h-64 flex items-center justify-center border border-white/5">
                           <span className="text-slate-600 font-mono">Coach Chat Interface</span>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </section>

      {/* Pricing Section (The Value Stack) */}
      <section id="pricing" className="py-24 relative">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-[400px] bg-indigo-500/5 blur-[100px] rounded-full -z-10" />

         <div className="container mx-auto px-6">
            <div className="text-center mb-16">
               <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Simple, Transparent Investment</h2>
               <p className="text-slate-400">Choose the level of accountability you need.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
               
               {/* Tier 1: Kickstart */}
               <div className="glass-card rounded-3xl p-8 flex flex-col glass-card-hover relative group">
                  <div className="mb-6">
                     <h3 className="text-xl font-medium text-slate-300 mb-2">The Kickstart</h3>
                     <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-white" data-testid="text-price-kickstart">$49</span>
                        <span className="text-slate-500">/mo</span>
                     </div>
                     <div className="mt-4 inline-block px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-bold border border-teal-500/20">
                        7-Day Free Trial
                     </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1">
                     <li className="flex items-start gap-3 text-slate-300 text-sm">
                        <Check className="w-5 h-5 text-teal-500 shrink-0" /> AI Dashboard Access
                     </li>
                     <li className="flex items-start gap-3 text-slate-300 text-sm">
                        <Check className="w-5 h-5 text-teal-500 shrink-0" /> Device Sync (All brands)
                     </li>
                     <li className="flex items-start gap-3 text-slate-300 text-sm">
                        <Check className="w-5 h-5 text-teal-500 shrink-0" /> Weekly Coach Check-in
                     </li>
                  </ul>
                  <button
                    onClick={() => openSignup("kickstart")}
                    className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white font-medium transition-colors"
                    data-testid="button-signup-kickstart"
                  >
                     Start Free Trial
                  </button>
               </div>

               {/* Tier 2: The Committed (Best Value) */}
               <div className="glass-card rounded-3xl p-1 flex flex-col relative transform md:-translate-y-4 z-10">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-orange-400 to-rose-400 text-slate-900 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg">
                     Best Value
                  </div>
                  <div className="bg-slate-900/90 rounded-[22px] p-8 h-full flex flex-col">
                     <div className="mb-6">
                        <h3 className="text-xl font-bold text-white mb-2">The Committed</h3>
                        <div className="flex items-baseline gap-1">
                           <span className="text-5xl font-bold text-white" data-testid="text-price-committed">$490</span>
                           <span className="text-slate-500">/yr</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Paid upfront. Save $98/year.</p>
                     </div>
                     
                     <div className="space-y-6 mb-8 flex-1">
                        <div className="space-y-3">
                           <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Core Features</div>
                           <li className="flex items-start gap-3 text-slate-300 text-sm">
                              <Check className="w-5 h-5 text-orange-400 shrink-0" /> Everything in Kickstart
                           </li>
                           <li className="flex items-start gap-3 text-slate-300 text-sm">
                              <Check className="w-5 h-5 text-orange-400 shrink-0" /> Priority Coach Access
                           </li>
                        </div>

                        <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                           <div className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-3">Included Bonuses</div>
                           <ul className="space-y-3">
                              <li className="flex items-start gap-3 text-white text-sm font-medium">
                                 <Check className="w-5 h-5 text-orange-400 shrink-0" /> $150 Value for Garmin HRM
                              </li>
                              <li className="flex items-start gap-3 text-white text-sm font-medium">
                                 <Check className="w-5 h-5 text-orange-400 shrink-0" /> "Better YOU" Anti-Diet Course
                              </li>
                           </ul>
                        </div>
                     </div>

                     <button
                       onClick={() => openSignup("committed")}
                       className="btn-secondary w-full py-4 rounded-xl shadow-lg shadow-orange-500/20"
                       data-testid="button-signup-committed"
                     >
                        Claim Annual Offer
                     </button>
                  </div>
               </div>

               {/* Tier 3: Transformation */}
               <div className="glass-card rounded-3xl p-8 flex flex-col glass-card-hover relative group">
                  <div className="mb-6">
                     <h3 className="text-xl font-medium text-slate-300 mb-2">The Transformation</h3>
                     <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-white" data-testid="text-price-transformation">$997</span>
                        <span className="text-slate-500">/one-time</span>
                     </div>
                     <div className="mt-4 inline-block px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700">
                        VIP Access
                     </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1">
                     <li className="flex items-start gap-3 text-slate-300 text-sm">
                        <Check className="w-5 h-5 text-white shrink-0" /> 1-on-1 Deep Dive Strategy
                     </li>
                     <li className="flex items-start gap-3 text-slate-300 text-sm">
                        <Check className="w-5 h-5 text-white shrink-0" /> Executive Wellness Audit
                     </li>
                     <li className="flex items-start gap-3 text-slate-300 text-sm">
                        <Check className="w-5 h-5 text-white shrink-0" /> Daily Live Coaching Interaction
                     </li>
                     <li className="flex items-start gap-3 text-slate-300 text-sm">
                        <Check className="w-5 h-5 text-white shrink-0" /> Lifetime Community Access
                     </li>
                  </ul>
                  <button
                    onClick={() => openSignup("transformation")}
                    className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white font-medium transition-colors"
                    data-testid="button-signup-transformation"
                  >
                     Book a Strategy Call
                  </button>
               </div>

            </div>
         </div>
      </section>

      {/* Testimonial Section */}
      <section className="py-24 bg-slate-900/50">
        <div className="container mx-auto px-6 max-w-4xl">
           <div className="glass-card p-10 rounded-2xl relative">
              <div className="absolute -top-6 -left-6 text-6xl text-teal-500/20 font-serif">"</div>
              <p className="text-2xl text-slate-200 leading-relaxed text-center italic mb-8">
                 "I've tried every app out there. RxFit is different because <span className="text-teal-400 font-bold">my coach actually sees the data</span>. When I had a bad sleep week, she adjusted my workouts automatically. That consistency changed everything."
              </p>
              <div className="flex items-center justify-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-slate-700" />
                 <div className="text-left">
                    <div className="font-bold text-white">Michael R.</div>
                    <div className="text-sm text-slate-500">Software Executive</div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 bg-slate-950">
        <div className="container mx-auto px-6">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-slate-900 text-xs font-bold">
                    Rx
                 </div>
                 <span className="text-lg font-bold text-slate-300">RxFit.ai</span>
              </div>
              <div className="text-slate-500 text-sm">
                 &copy; {new Date().getFullYear()} RxFit AI. All rights reserved.
              </div>
              <div className="flex gap-6 text-sm text-slate-500">
                 <a href="#" className="hover:text-white transition-colors">Privacy</a>
                 <a href="#" className="hover:text-white transition-colors">Terms</a>
                 <a href="#" className="hover:text-white transition-colors">Contact</a>
              </div>
           </div>
        </div>
      </footer>

    </div>
  );
}
