"use client";

/**
 * Install App button
 * ══════════════════
 *
 * Renders nothing unless Chrome has said the app can be installed AND it isn't
 * already running as the installed app. So it never shows a button that does
 * nothing (desktop Safari, iOS, already installed, not yet eligible).
 */

import { useState } from "react";
import { Download } from "lucide-react";
import { usePwa } from "./pwa-provider";
import { cn } from "@/lib/utils/cn";

interface InstallButtonProps {
  className?: string;
  label?: string;
}

export function InstallButton({
  className,
  label = "Install app",
}: InstallButtonProps) {
  const { canInstall, promptInstall } = usePwa();
  const [busy, setBusy] = useState(false);

  if (!canInstall) return null;

  async function handleClick() {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-primary/40",
        "bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary",
        "hover:bg-primary/15 disabled:opacity-50 transition-colors",
        className
      )}
    >
      <Download size={16} aria-hidden />
      {label}
    </button>
  );
}

/** Settings card wrapper — hidden entirely when installing isn't possible. */
export function InstallAppCard() {
  const { canInstall } = usePwa();
  if (!canInstall) return null;

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Install app
      </h2>
      <p className="text-sm text-text-secondary">
        Add MyFitLog to your home screen. It opens full-screen like a normal
        app, and sets you log keep saving when the gym has no signal.
      </p>
      <InstallButton className="w-full" label="Install MyFitLog" />
    </div>
  );
}
