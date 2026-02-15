import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Activity, 
  Brain, 
  Check, 
  ChevronRight, 
  Clock, 
  Heart, 
  LayoutDashboard, 
  MessageSquare, 
  ShieldCheck, 
  Smartphone, 
  Users, 
  Zap,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

import heroDashboardImg from "../assets/hero-dashboard.png";

// Animation variants
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      
      {/* Sticky Navbar */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-white/80 border-b border-slate-200">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-serif font-bold">
              Rx
            </div>
            <span className="text-xl font-serif font-bold tracking-tight text-primary">RxFit<span className="text-secondary">.ai</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-primary transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-primary transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
          </div>
          <button className="btn-primary px-5 py-2 rounded-full text-sm font-bold shadow-lg shadow-primary/20">
            Start Free Trial
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 overflow-hidden bg-slate-50">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-slate-200/50 blur-[120px] rounded-full -z-10" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-secondary/10 blur-[100px] rounded-full -z-10" />

        <div className="container mx-auto text-center max-w-5xl relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
          >
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-secondary text-xs font-bold tracking-wider uppercase mb-4 shadow-sm">
              <Zap className="w-3 h-3 fill-secondary" />
              The Future of Personal Health
            </motion.div>
            
            <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-serif font-bold tracking-tight leading-tight text-primary">
              Your AI Health Dashboard.<br />
              <span className="text-secondary">Your Human Coach.</span>
            </motion.h1>
            
            <motion.p variants={fadeIn} className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Stop guessing. <span className="text-primary font-medium">RxFit.ai</span> syncs with your devices and connects you to a real human coach to turn your data into daily, consistent action.
            </motion.p>
            
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button className="btn-primary w-full sm:w-auto px-8 py-4 rounded-full text-lg shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group">
                Start Your Free Trial
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="w-full sm:w-auto px-8 py-4 rounded-full text-lg font-medium text-slate-600 hover:text-primary border border-slate-200 hover:border-primary hover:bg-white transition-all flex items-center justify-center gap-2 bg-white/50">
                See How It Works
              </button>
            </motion.div>
            
            <motion.div 
              variants={fadeIn}
              className="pt-16 relative"
            >
               {/* Hero Image / Dashboard Mockup */}
               <div className="relative mx-auto max-w-4xl rounded-xl border border-slate-200 shadow-2xl shadow-slate-300/50 bg-white overflow-hidden group">
                 <img 
                   src={heroDashboardImg} 
                   alt="RxFit AI Dashboard" 
                   className="w-full h-auto object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                 />
                 
                 {/* Floating UI Elements for depth */}
                 <div className="absolute bottom-10 left-10 z-20 paper-card p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
                    <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center text-secondary">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Recovery Score</div>
                      <div className="text-lg font-bold text-primary">92% <span className="text-xs font-normal text-emerald-600">↑ 4%</span></div>
                    </div>
                 </div>

                 <div className="absolute top-10 right-10 z-20 paper-card p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-1000 delay-500">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Coach Sarah</div>
                      <div className="text-sm font-bold text-slate-800">"Great sleep data! Let's push..."</div>
                    </div>
                 </div>
               </div>
            </motion.div>
          </motion.div>
        </div>
      </header>

      {/* Social Proof */}
      <section className="py-10 border-y border-slate-200 bg-white">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-8">Works seamlessly with your favorite gear</p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
             {/* Simple text logos for now, normally would be SVGs */}
             <span className="text-xl font-bold text-slate-800">OURA</span>
             <span className="text-xl font-bold text-slate-800">GARMIN</span>
             <span className="text-xl font-bold text-slate-800">WHOOP</span>
             <span className="text-xl font-bold text-slate-800">Apple Health</span>
             <span className="text-xl font-bold text-slate-800">STRAVA</span>
          </div>
        </div>
      </section>

      {/* The Problem (Agitation) */}
      <section className="py-24 relative bg-white">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-serif font-bold text-primary mb-6">Why do most high-performers fail?</h2>
          <p className="text-lg text-slate-600 mb-16 max-w-2xl mx-auto">
            It's not lack of effort. It's the cycle of <span className="text-secondary font-bold">information overload</span> and <span className="text-secondary font-bold">isolation</span>.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors text-left hover:shadow-md">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mb-4">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif font-bold text-primary mb-3">Data without Direction</h3>
              <p className="text-slate-600">You have 10,000 data points from your watch, but no idea what to actually <em>do</em> today.</p>
            </div>
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors text-left hover:shadow-md">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mb-4">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif font-bold text-primary mb-3">Decision Fatigue</h3>
              <p className="text-slate-600">Trying to be the nutritionist, trainer, and data analyst while running your business.</p>
            </div>
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors text-left hover:shadow-md">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif font-bold text-primary mb-3">Isolation</h3>
              <p className="text-slate-600">Apps can't keep you accountable. When things get tough, it's easy to ignore a notification.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The Solution (The RxFit Way) */}
      <section id="features" className="py-24 relative overflow-hidden bg-slate-50">
         <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-secondary/5 blur-[120px] rounded-full -z-10" />
         
         <div className="container mx-auto px-6">
            <div className="text-center mb-16">
               <h2 className="text-3xl md:text-5xl font-serif font-bold text-primary mb-4">The <span className="text-secondary">RxFit</span> Way</h2>
               <p className="text-slate-600">From overwhelmed to optimized in three steps.</p>
            </div>

            <div className="space-y-24">
               {/* Feature 1 */}
               <div className="flex flex-col md:flex-row items-center gap-12">
                  <div className="flex-1 space-y-6">
                     <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                        <LayoutDashboard className="w-6 h-6" />
                     </div>
                     <h3 className="text-3xl font-serif font-bold text-primary">Centralized AI Hub</h3>
                     <p className="text-lg text-slate-600 leading-relaxed">
                        We integrate with Apple Health, Oura, Garmin, and more to create a single source of truth. Our AI analyzes your biometrics to find patterns you'd miss.
                     </p>
                     <ul className="space-y-3">
                        <li className="flex items-center gap-3 text-slate-700">
                           <Check className="w-5 h-5 text-secondary" /> Auto-syncs with all major wearables
                        </li>
                        <li className="flex items-center gap-3 text-slate-700">
                           <Check className="w-5 h-5 text-secondary" /> Daily Readiness Score
                        </li>
                     </ul>
                  </div>
                  <div className="flex-1 relative">
                     <div className="paper-card p-1 rounded-2xl rotate-3 hover:rotate-0 transition-transform duration-500 shadow-xl">
                        <div className="bg-slate-50 rounded-xl p-8 h-64 flex items-center justify-center border border-slate-200">
                           <span className="text-slate-400 font-mono">AI Visualization Placeholder</span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Feature 2 */}
               <div className="flex flex-col md:flex-row-reverse items-center gap-12">
                  <div className="flex-1 space-y-6">
                     <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary border border-secondary/20">
                        <Users className="w-6 h-6" />
                     </div>
                     <h3 className="text-3xl font-serif font-bold text-primary">Real Human Touch</h3>
                     <p className="text-lg text-slate-600 leading-relaxed">
                        Not a chatbot. A dedicated coach who sees your data and adjusts your plan daily. They know when to push you and when to tell you to rest.
                     </p>
                     <ul className="space-y-3">
                        <li className="flex items-center gap-3 text-slate-700">
                           <Check className="w-5 h-5 text-secondary" /> Daily human check-ins
                        </li>
                        <li className="flex items-center gap-3 text-slate-700">
                           <Check className="w-5 h-5 text-secondary" /> Custom workout & nutrition adjustments
                        </li>
                     </ul>
                  </div>
                  <div className="flex-1 relative">
                     <div className="paper-card p-1 rounded-2xl -rotate-3 hover:rotate-0 transition-transform duration-500 shadow-xl">
                        <div className="bg-slate-50 rounded-xl p-8 h-64 flex items-center justify-center border border-slate-200">
                           <span className="text-slate-400 font-mono">Coach Chat Interface</span>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </section>

      {/* Pricing Section (The Value Stack) */}
      <section id="pricing" className="py-24 relative bg-white">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-[400px] bg-slate-200/50 blur-[100px] rounded-full -z-10" />

         <div className="container mx-auto px-6">
            <div className="text-center mb-16">
               <h2 className="text-4xl md:text-5xl font-serif font-bold text-primary mb-4">Simple, Transparent Investment</h2>
               <p className="text-slate-600">Choose the level of accountability you need.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
               
               {/* Tier 1: Kickstart */}
               <div className="paper-card rounded-3xl p-8 flex flex-col paper-card-hover relative group border border-slate-200">
                  <div className="mb-6">
                     <h3 className="text-xl font-serif font-medium text-slate-600 mb-2">The Kickstart</h3>
                     <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-serif font-bold text-primary">$49</span>
                        <span className="text-slate-500">/mo</span>
                     </div>
                     <div className="mt-4 inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                        7-Day Free Trial
                     </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1">
                     <li className="flex items-start gap-3 text-slate-600 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> AI Dashboard Access
                     </li>
                     <li className="flex items-start gap-3 text-slate-600 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> Device Sync (All brands)
                     </li>
                     <li className="flex items-start gap-3 text-slate-600 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> Weekly Reports
                     </li>
                  </ul>
                  <button className="w-full py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-primary font-medium transition-colors">
                     Start Free Trial
                  </button>
               </div>

               {/* Tier 2: The Committed (Best Value) */}
               <div className="paper-card rounded-3xl p-1 flex flex-col relative transform md:-translate-y-4 z-10 shadow-2xl">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-secondary text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg border border-white">
                     Best Value
                  </div>
                  <div className="bg-primary rounded-[22px] p-8 h-full flex flex-col text-white">
                     <div className="mb-6">
                        <h3 className="text-xl font-serif font-bold text-white mb-2">The Committed</h3>
                        <div className="flex items-baseline gap-1">
                           <span className="text-5xl font-serif font-bold text-white">$490</span>
                           <span className="text-slate-400">/yr</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Paid upfront. Save $98/year.</p>
                     </div>
                     
                     <div className="space-y-6 mb-8 flex-1">
                        <div className="space-y-3">
                           <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Core Features</div>
                           <li className="flex items-start gap-3 text-slate-300 text-sm">
                              <Check className="w-5 h-5 text-secondary shrink-0" /> Everything in Kickstart
                           </li>
                           <li className="flex items-start gap-3 text-slate-300 text-sm">
                              <Check className="w-5 h-5 text-secondary shrink-0" /> Priority Coach Access
                           </li>
                        </div>

                        <div className="p-4 rounded-xl bg-white/10 border border-white/10">
                           <div className="text-xs font-bold text-secondary uppercase tracking-wider mb-3">Included Bonuses</div>
                           <ul className="space-y-3">
                              <li className="flex items-start gap-3 text-white text-sm font-medium">
                                 <Check className="w-5 h-5 text-secondary shrink-0" /> $150 Credit for Garmin HRM
                              </li>
                              <li className="flex items-start gap-3 text-white text-sm font-medium">
                                 <Check className="w-5 h-5 text-secondary shrink-0" /> "Better YOU" Anti-Diet Course
                              </li>
                           </ul>
                        </div>
                     </div>

                     <button className="btn-gold w-full py-4 rounded-xl shadow-lg">
                        Claim Annual Offer
                     </button>
                  </div>
               </div>

               {/* Tier 3: The Transformation */}
               <div className="paper-card rounded-3xl p-8 flex flex-col paper-card-hover relative group border border-slate-200">
                  <div className="mb-6">
                     <h3 className="text-xl font-serif font-medium text-slate-600 mb-2">The Transformation</h3>
                     <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-serif font-bold text-primary">$997</span>
                        <span className="text-slate-500">/one-time</span>
                     </div>
                     <div className="mt-4 inline-block px-3 py-1 rounded-full bg-slate-800 text-white text-xs font-bold">
                        VIP Access
                     </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1">
                     <li className="flex items-start gap-3 text-slate-600 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> 1-on-1 Deep Dive Strategy
                     </li>
                     <li className="flex items-start gap-3 text-slate-600 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> Wellness Audit
                     </li>
                     <li className="flex items-start gap-3 text-slate-600 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> Daily Live Coaching Interaction
                     </li>
                     <li className="flex items-start gap-3 text-slate-600 text-sm">
                        <Check className="w-5 h-5 text-primary shrink-0" /> Lifetime Community Access
                     </li>
                  </ul>
                  <button className="w-full py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-primary font-medium transition-colors">
                     Book a Strategy Call
                  </button>
               </div>

            </div>
         </div>
      </section>

      {/* Testimonial Section */}
      <section className="py-24 bg-slate-50 border-t border-slate-200">
        <div className="container mx-auto px-6 max-w-4xl">
           <div className="paper-card p-10 rounded-2xl relative shadow-lg">
              <div className="absolute -top-6 -left-6 text-6xl text-primary/10 font-serif">"</div>
              <p className="text-2xl text-slate-700 leading-relaxed text-center italic mb-8 font-serif">
                 "I've tried every app out there. RxFit is different because <span className="text-primary font-bold">my coach actually sees the data</span>. When I had a bad sleep week, she adjusted my workouts automatically. That consistency changed everything."
              </p>
              <div className="flex items-center justify-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-slate-200" /> {/* Avatar Placeholder */}
                 <div className="text-left">
                    <div className="font-bold text-primary font-serif">Michael R.</div>
                    <div className="text-sm text-slate-500">Software Engineer</div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 bg-white">
        <div className="container mx-auto px-6">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-white text-xs font-bold font-serif">
                    Rx
                 </div>
                 <span className="text-lg font-serif font-bold text-primary">RxFit.ai</span>
              </div>
              <div className="text-slate-500 text-sm">
                 &copy; {new Date().getFullYear()} RxFit AI. All rights reserved.
              </div>
              <div className="flex gap-6 text-sm text-slate-500">
                 <a href="#" className="hover:text-primary transition-colors">Privacy</a>
                 <a href="#" className="hover:text-primary transition-colors">Terms</a>
                 <a href="#" className="hover:text-primary transition-colors">Contact</a>
              </div>
           </div>
        </div>
      </footer>

    </div>
  );
}
