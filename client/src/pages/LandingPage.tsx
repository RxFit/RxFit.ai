import React, { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Activity, 
  BarChart2, 
  Bell, 
  Calendar, 
  ChevronRight, 
  Clock, 
  FileText, 
  Heart, 
  LayoutDashboard, 
  LogOut, 
  Menu, 
  MessageSquare, 
  PieChart, 
  Settings, 
  ShieldCheck, 
  TrendingUp, 
  User, 
  Zap,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

// Animation variants
const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function LandingPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden font-sans">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation - The "Navy Blue Sidebar" */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 bg-primary text-slate-300 transform transition-transform duration-300 ease-in-out border-r border-slate-800 shadow-2xl
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="h-full flex flex-col">
          {/* Logo Area */}
          <div className="p-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center text-white font-serif font-bold text-xl shadow-lg">
                Rx
              </div>
              <div>
                <h1 className="text-xl font-serif font-bold text-white tracking-tight leading-none">RxFit.ai</h1>
                <p className="text-[10px] uppercase tracking-widest text-secondary mt-1 font-semibold">Biological Asset Mgmt</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-4 pt-2">Executive Overview</div>
            
            <a href="#" className="sidebar-link sidebar-link-active group">
              <LayoutDashboard className="w-4 h-4 text-secondary group-hover:text-white" />
              <span>Dashboard</span>
            </a>
            <a href="#" className="sidebar-link group">
              <Activity className="w-4 h-4 group-hover:text-white" />
              <span>Vital Signs</span>
            </a>
            <a href="#" className="sidebar-link group">
              <TrendingUp className="w-4 h-4 group-hover:text-white" />
              <span>Trends & Analysis</span>
            </a>
            <a href="#" className="sidebar-link group">
              <FileText className="w-4 h-4 group-hover:text-white" />
              <span>Weekly Briefs</span>
            </a>

            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 mt-8 px-4">Accountability</div>
            
            <a href="#" className="sidebar-link group">
              <MessageSquare className="w-4 h-4 group-hover:text-white" />
              <span>Coach Concierge</span>
              <span className="ml-auto w-2 h-2 rounded-full bg-secondary"></span>
            </a>
            <a href="#" className="sidebar-link group">
              <Calendar className="w-4 h-4 group-hover:text-white" />
              <span>Schedule Audit</span>
            </a>
            <a href="#" className="sidebar-link group">
              <User className="w-4 h-4 group-hover:text-white" />
              <span>Profile</span>
            </a>
          </div>

          {/* User Profile Snippet */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-serif">
                MR
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">Michael Ross</p>
                <p className="text-xs text-slate-500 truncate">Executive Plan</p>
              </div>
              <Settings className="w-4 h-4 text-slate-500 hover:text-white cursor-pointer" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background relative">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-10 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-md"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-serif font-bold text-slate-800 hidden sm:block">Executive Dashboard</h2>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-200">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-medium text-slate-600">System Online • Data Synced 2m ago</span>
            </div>
            <button className="relative p-2 text-slate-500 hover:text-primary transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary border border-white"></span>
            </button>
          </div>
        </header>

        {/* Scrollable Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-8 pb-10">

            {/* Key Insight / Signal Box */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary text-white p-6 rounded-lg shadow-lg border-l-4 border-secondary flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-secondary" />
                  <span className="text-xs font-bold uppercase tracking-widest text-secondary">Daily Executive Signal</span>
                </div>
                <h3 className="text-xl font-serif font-medium leading-snug">
                  Your recovery score is <span className="text-secondary border-b border-secondary/50">optimal</span> today. Prioritize high-leverage decision making before 2:00 PM.
                </h3>
              </div>
              <button className="shrink-0 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded border border-white/20 transition-colors">
                View Detailed Analysis
              </button>
            </motion.div>

            {/* Dashboard Grid */}
            <motion.div 
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-12 gap-6"
            >
              {/* Left Column (Main Metrics) */}
              <div className="md:col-span-8 space-y-6">
                
                {/* Metrics Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {/* Card 1 */}
                  <motion.div variants={fadeIn} className="paper-card p-6 rounded-lg gold-accent-top hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Readiness</h4>
                      <Activity className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-serif font-bold text-slate-900">92</span>
                      <span className="text-sm font-medium text-emerald-600">/ 100</span>
                    </div>
                    <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 w-[92%]"></div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Peak performance zone</p>
                  </motion.div>

                  {/* Card 2 */}
                  <motion.div variants={fadeIn} className="paper-card p-6 rounded-lg border-t-4 border-emerald-500 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Sleep Debt</h4>
                      <Clock className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-serif font-bold text-slate-900">0.5</span>
                      <span className="text-sm font-medium text-slate-500">hrs</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                      <span className="text-xs text-slate-500">Within optimal range</span>
                    </div>
                  </motion.div>

                  {/* Card 3 */}
                  <motion.div variants={fadeIn} className="paper-card p-6 rounded-lg border-t-4 border-orange-400 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Stress Load</h4>
                      <TrendingUp className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-serif font-bold text-slate-900">Med</span>
                      <span className="text-sm font-medium text-orange-500">Elevated</span>
                    </div>
                    <div className="mt-4 text-xs text-slate-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-orange-500" />
                      <span>Scheduled deep work recommended</span>
                    </div>
                  </motion.div>
                </div>

                {/* Main Chart Section */}
                <motion.div variants={fadeIn} className="paper-card p-8 rounded-lg">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-lg font-serif font-bold text-slate-900">Heart Rate Variability (HRV) Trend</h3>
                      <p className="text-sm text-slate-500 mt-1">30-Day Moving Average vs. Baseline</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded hover:bg-slate-200">7D</button>
                      <button className="px-3 py-1 text-xs font-medium bg-primary text-white rounded shadow-sm">30D</button>
                      <button className="px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded hover:bg-slate-200">90D</button>
                    </div>
                  </div>
                  
                  {/* Mock Chart Area */}
                  <div className="h-64 w-full bg-slate-50 rounded border border-slate-100 relative flex items-end justify-between px-4 pb-4 overflow-hidden">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 border-t border-slate-200 top-1/4"></div>
                    <div className="absolute inset-0 border-t border-slate-200 top-2/4"></div>
                    <div className="absolute inset-0 border-t border-slate-200 top-3/4"></div>

                    {/* Simple SVG Sparkline approximation */}
                    <svg className="absolute inset-0 w-full h-full p-4" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M0,80 Q10,75 20,60 T40,50 T60,40 T80,30 T100,20" fill="none" stroke="#0F172A" strokeWidth="0.5" />
                      <path d="M0,80 Q10,75 20,60 T40,50 T60,40 T80,30 T100,20" fill="url(#gradient)" stroke="none" opacity="0.1" />
                      <defs>
                        <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#0F172A" />
                          <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                      </defs>
                    </svg>
                    
                    {/* X-Axis Labels */}
                    <span className="text-[10px] text-slate-400 z-10">Nov 1</span>
                    <span className="text-[10px] text-slate-400 z-10">Nov 8</span>
                    <span className="text-[10px] text-slate-400 z-10">Nov 15</span>
                    <span className="text-[10px] text-slate-400 z-10">Nov 22</span>
                    <span className="text-[10px] text-slate-400 z-10">Today</span>
                  </div>
                </motion.div>

                {/* Biological Assets Table */}
                <motion.div variants={fadeIn} className="paper-card rounded-lg overflow-hidden">
                  <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-serif font-bold text-slate-900">Biological Assets</h3>
                    <button className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
                      Full Report <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="px-8 py-4 w-1/3">Biometric Marker</th>
                        <th className="px-8 py-4">Current Value</th>
                        <th className="px-8 py-4">Reference Range</th>
                        <th className="px-8 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4 font-medium text-slate-900">VO2 Max</td>
                        <td className="px-8 py-4 text-slate-600">54 ml/kg/min</td>
                        <td className="px-8 py-4 text-slate-400 text-xs">45 - 60</td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span className="text-emerald-700 font-medium text-xs">Optimal</span>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4 font-medium text-slate-900">Resting Heart Rate</td>
                        <td className="px-8 py-4 text-slate-600">48 bpm</td>
                        <td className="px-8 py-4 text-slate-400 text-xs">40 - 60</td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span className="text-emerald-700 font-medium text-xs">Optimal</span>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4 font-medium text-slate-900">Vitamin D</td>
                        <td className="px-8 py-4 text-slate-600">28 ng/mL</td>
                        <td className="px-8 py-4 text-slate-400 text-xs">30 - 100</td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                            <span className="text-orange-700 font-medium text-xs">Sub-optimal</span>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4 font-medium text-slate-900">HbA1c</td>
                        <td className="px-8 py-4 text-slate-600">5.1%</td>
                        <td className="px-8 py-4 text-slate-400 text-xs">4.0 - 5.6%</td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span className="text-emerald-700 font-medium text-xs">Optimal</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </motion.div>
              </div>

              {/* Right Column (Coach & Concierge) */}
              <div className="md:col-span-4 space-y-6">
                
                {/* Concierge Card */}
                <motion.div variants={fadeIn} className="paper-card p-6 rounded-lg navy-accent-top">
                  <h3 className="text-lg font-serif font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-secondary" />
                    Coach Concierge
                  </h3>
                  
                  <div className="space-y-4 mb-6">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0 overflow-hidden">
                         <User className="w-full h-full p-1 text-slate-400" />
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg rounded-tl-none border border-slate-100 text-sm text-slate-600 shadow-sm">
                        <p>I noticed your HRV dropped last night. Let's shift today's session to Zone 2 recovery instead of HIIT.</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 flex-row-reverse">
                      <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center text-xs text-white">MR</div>
                      <div className="bg-primary/5 p-3 rounded-lg rounded-tr-none border border-primary/10 text-sm text-primary shadow-sm">
                        <p>Sounds good. What time works best?</p>
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Message Dr. Sarah..." 
                      className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm shadow-inner"
                    />
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>

                {/* Plan Status */}
                <motion.div variants={fadeIn} className="paper-card p-6 rounded-lg">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">Membership Tier</h3>
                  <div className="bg-slate-900 text-white rounded-md p-6 relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/20 blur-xl rounded-full -translate-y-1/2 translate-x-1/2"></div>
                     
                     <div className="relative z-10">
                       <div className="flex items-center justify-between mb-2">
                         <span className="text-secondary font-serif italic">Executive</span>
                         <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold uppercase border border-white/20">Active</span>
                       </div>
                       <div className="h-px w-full bg-white/10 my-4"></div>
                       <ul className="space-y-2 text-sm text-slate-300">
                         <li className="flex items-center gap-2">
                           <CheckCircle2 className="w-4 h-4 text-secondary" /> Priority Lab Analysis
                         </li>
                         <li className="flex items-center gap-2">
                           <CheckCircle2 className="w-4 h-4 text-secondary" /> 24/7 Coach Access
                         </li>
                         <li className="flex items-center gap-2">
                           <CheckCircle2 className="w-4 h-4 text-secondary" /> Quarterly Executive Audit
                         </li>
                       </ul>
                     </div>
                  </div>
                </motion.div>

                {/* Upcoming Schedule */}
                <motion.div variants={fadeIn} className="paper-card p-6 rounded-lg">
                   <h3 className="text-lg font-serif font-bold text-slate-900 mb-4">Upcoming Protocol</h3>
                   <div className="space-y-4">
                      <div className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                         <div className="flex flex-col items-center min-w-[3rem]">
                            <span className="text-xs font-bold text-slate-400 uppercase">Today</span>
                            <span className="text-lg font-serif font-bold text-slate-900">15</span>
                         </div>
                         <div>
                            <h4 className="font-bold text-slate-800 text-sm">Zone 2 Cardio</h4>
                            <p className="text-xs text-slate-500 mt-1">45 mins • Target HR 135bpm</p>
                         </div>
                      </div>
                      <div className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                         <div className="flex flex-col items-center min-w-[3rem]">
                            <span className="text-xs font-bold text-slate-400 uppercase">Tom</span>
                            <span className="text-lg font-serif font-bold text-slate-900">16</span>
                         </div>
                         <div>
                            <h4 className="font-bold text-slate-800 text-sm">Blood Panel Fasting</h4>
                            <p className="text-xs text-slate-500 mt-1">08:00 AM • Quest Diagnostics</p>
                         </div>
                      </div>
                   </div>
                </motion.div>

              </div>
            </motion.div>
          </div>
        </div>
      </main>

    </div>
  );
}
