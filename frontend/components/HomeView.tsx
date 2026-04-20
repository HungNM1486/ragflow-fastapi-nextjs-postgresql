"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageSquare, Settings, LogIn, Shield, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = { healthLine: string };

export default function HomeView({ healthLine }: Props) {
  const isOk = healthLine.toLowerCase().includes("ok");

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } as any },
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 selection:bg-zinc-200">
      {/* Background patterns */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-zinc-100 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-100 rounded-full blur-[120px]" />
      </div>

      <main className="relative z-10 container mx-auto px-6 pt-24 pb-12 flex flex-col items-center justify-center">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-3xl w-full text-center space-y-12"
        >
          {/* Badge */}
          <motion.div variants={itemVariants} className="flex justify-center">
            <div className={cn(
              "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border backdrop-blur-sm transition-all",
              isOk ? "bg-emerald-50/50 border-emerald-100 text-emerald-700" : "bg-amber-50/50 border-amber-100 text-amber-700"
            )}>
              {isOk ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {healthLine}
            </div>
          </motion.div>

          {/* Hero Content */}
          <div className="space-y-6">
            <motion.h1 
              variants={itemVariants}
              className="text-5xl md:text-7xl font-bold tracking-tight text-zinc-900"
            >
              RAGFlow <span className="text-zinc-400">Legal</span>
            </motion.h1>
            <motion.p 
              variants={itemVariants}
              className="text-lg md:text-xl text-zinc-500 max-w-xl mx-auto leading-relaxed"
            >
              Hệ thống tra cứu và phân tích văn bản pháp luật thông minh, được tối ưu hóa cho độ chính xác và hiệu suất cao.
            </motion.p>
          </div>

          {/* Action Cards */}
          <motion.div 
            variants={itemVariants}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4"
          >
            <ActionCard 
              href="/chat"
              title="Chat"
              description="Hỏi đáp pháp lý với AI dựa trên kho dữ liệu của bạn."
              icon={<MessageSquare className="w-5 h-5 text-zinc-900" />}
              primary
            />
            <ActionCard 
              href="/admin"
              title="Admin"
              description="Quản lý dữ liệu, người dùng và thiết lập hệ thống."
              icon={<Settings className="w-5 h-5 text-zinc-500" />}
            />
            <ActionCard 
              href="/login"
              title="Tài khoản"
              description="Đăng nhập để quản lý và cá nhân hóa trải nghiệm."
              icon={<LogIn className="w-5 h-5 text-zinc-500" />}
            />
          </motion.div>

          {/* Infrastructure Info */}
          <motion.div 
            variants={itemVariants}
            className="pt-12 border-t border-zinc-200/60"
          >
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
               <div className="flex items-center gap-2">
                 <Shield className="w-5 h-5" />
                 <span className="text-sm font-semibold tracking-widest uppercase">Safe & Secure</span>
               </div>
               <div className="text-sm font-medium">Bản quyền &copy; 2024 LegalTech Solutions</div>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}

function ActionCard({ href, title, description, icon, primary = false }: { 
  href: string, 
  title: string, 
  description: string, 
  icon: React.ReactNode,
  primary?: boolean 
}) {
  return (
    <Link href={href} className="group">
      <div className={cn(
        "h-full p-6 text-left rounded-2xl border transition-all duration-300",
        primary 
          ? "bg-white border-zinc-200 shadow-sm group-hover:shadow-md group-hover:border-zinc-300" 
          : "bg-zinc-50/50 border-transparent hover:bg-white hover:border-zinc-200 hover:shadow-sm"
      )}>
        <div className="w-10 h-10 rounded-xl bg-white border border-zinc-100 flex items-center justify-center mb-4 shadow-sm transition-transform duration-300 group-hover:scale-110">
          {icon}
        </div>
        <h3 className="text-base font-semibold text-zinc-900 mb-2">{title}</h3>
        <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}
