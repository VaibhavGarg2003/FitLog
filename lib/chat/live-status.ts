"use client";

/**
 * Live-chat connection status, shared by the provider (which sets it) and the
 * chat hooks (which poll slower while live). Kept separate from both so they
 * don't import each other.
 */

import { createContext, useContext } from "react";

export type LiveStatus = "off" | "connecting" | "live" | "offline";

export const LiveStatusContext = createContext<LiveStatus>("off");

export function useLiveChatStatus(): LiveStatus {
  return useContext(LiveStatusContext);
}
