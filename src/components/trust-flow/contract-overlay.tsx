"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

export function ContractOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative max-w-lg overflow-hidden rounded-2xl border border-gold/50 bg-gradient-to-b from-deepblue/90 to-void/95 p-10 text-center shadow-[0_0_80px_rgba(212,175,55,0.35)] backdrop-blur-xl"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
          >
            <motion.div
              className="pointer-events-none absolute -inset-24 rounded-full bg-gold/15 blur-3xl"
              animate={{ opacity: [0.35, 0.6, 0.35] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-gold/80">
                Smart Contract
              </p>
              <h2 className="text-2xl font-medium tracking-wide text-gold">
                数字合约已签署
              </h2>
              <p className="text-sm text-white/75">资金进入金库 · 归属计划已生效</p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-gold"
                    initial={{ opacity: 0.2, y: 6 }}
                    animate={{ opacity: [0.2, 1, 0.2], y: [6, 0, 6] }}
                    transition={{
                      duration: 1.6,
                      delay: i * 0.08,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-6 border-gold/50 text-gold hover:bg-gold/10"
                onClick={onClose}
              >
                继续操作
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
