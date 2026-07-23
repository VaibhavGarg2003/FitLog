/**
 * Cloudflare Turnstile — production-only CAPTCHA widget
 * ═══════════════════════════════════════════════════════
 *
 * Supabase Auth verifies the token server-side (Secret Key lives in
 * Supabase Dashboard → Auth → CAPTCHA). We only collect a one-time
 * token with the public Site Key and forward it on login/signup.
 *
 * Disabled outside production so local/dev auth stays frictionless.
 * Also no-ops if NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset.
 */
"use client";

import { useRef, useImperativeHandle, forwardRef } from "react";
import {
  Turnstile,
  type TurnstileInstance,
} from "@marsidev/react-turnstile";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** True only when the production build has a site key configured. */
export const isTurnstileEnabled =
  process.env.NODE_ENV === "production" && Boolean(SITE_KEY);

export type TurnstileFieldHandle = {
  /** Invalidate the current token and request a new one (tokens are single-use). */
  reset: () => void;
};

type Props = {
  onToken: (token: string | null) => void;
};

export const TurnstileField = forwardRef<TurnstileFieldHandle, Props>(
  function TurnstileField({ onToken }, ref) {
    const widgetRef = useRef<TurnstileInstance | null>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        onToken(null);
        widgetRef.current?.reset();
      },
    }));

    if (!isTurnstileEnabled || !SITE_KEY) return null;

    return (
      <div className="flex justify-center">
        <Turnstile
          ref={widgetRef}
          siteKey={SITE_KEY}
          onSuccess={(token) => onToken(token)}
          onExpire={() => onToken(null)}
          onError={() => onToken(null)}
          options={{ theme: "auto", size: "normal" }}
        />
      </div>
    );
  }
);
