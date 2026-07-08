/**
 * AI Meal Input — Natural Language Food Logger
 * ═════════════════════════════════════════════
 *
 * WHAT IT DOES:
 * ─────────────
 * A text area where users type "I had 2 rotis with dal and curd"
 * and the AI parses it into individual food log entries.
 *
 * HOW IT CONNECTS:
 * ────────────────
 * useAIMealParser(date) hook → POST /api/ai/parse-meal
 *   → ai.service.parseMealText()
 *     → runWithFallback() (Gemini → Groq → OpenRouter)
 *     → logFoodItem() / logCustomFood() (Step 3)
 *   → cache invalidation → CalorieRing + MealSections update
 *
 * STATES:
 * ───────
 * idle → user types meal description
 * loading → AI is parsing (shimmer animation)
 * success → shows parsed items in green confirmation card
 * error → shows error message + fallback suggestion
 */

"use client";

import { useState } from "react";
import { useAIMealParser } from "@/lib/hooks/use-ai-meal-parser";

interface AIMealInputProps {
  date: string;
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  onClose: () => void;
}

export function AIMealInput({ date, mealType, onClose }: AIMealInputProps) {
  const [text, setText] = useState("");
  const parser = useAIMealParser(date);

  const handleParse = () => {
    if (text.trim().length < 3) return;

    parser.mutate(
      { text: text.trim(), mealType, date },
      {
        onSuccess: () => {
          // After 3 seconds, close the input and clear state
          setTimeout(() => {
            setText("");
            parser.reset();
            onClose();
          }, 3000);
        },
      }
    );
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <h3 className="font-semibold text-sm text-text-primary">
            Log with AI
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-secondary text-sm"
        >
          ✕
        </button>
      </div>

      {/* Input */}
      {!parser.isSuccess && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe your meal... e.g., '2 rotis with dal and a small bowl of curd'"
            className="w-full bg-background border border-border rounded-lg p-3 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            rows={3}
            disabled={parser.isPending}
          />

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-text-muted">
              Powered by Gemini AI • Estimates may vary
            </p>
            <button
              onClick={handleParse}
              disabled={text.trim().length < 3 || parser.isPending}
              className="px-4 py-2 bg-gradient-to-r from-primary to-accent text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary/20 transition-all duration-200"
            >
              {parser.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Parsing...
                </span>
              ) : (
                "Parse with AI ✨"
              )}
            </button>
          </div>
        </>
      )}

      {/* Loading shimmer */}
      {parser.isPending && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 bg-gradient-to-r from-surface via-border/50 to-surface rounded-lg animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
          <p className="text-xs text-text-muted text-center">
            AI is identifying your foods...
          </p>
        </div>
      )}

      {/* Success result */}
      {parser.isSuccess && parser.data && (
        <div className="space-y-2">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <p className="text-sm font-medium text-primary mb-2">
              ✅ Logged {parser.data.logged.length} item{parser.data.logged.length !== 1 ? "s" : ""} • {parser.data.totalCalories} kcal
            </p>
            <div className="space-y-1">
              {parser.data.logged.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-text-primary">
                    {item.name}
                    <span className="text-text-muted ml-1">
                      ({item.quantity}g)
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary">
                      {item.calories} kcal
                    </span>
                    {item.matched ? (
                      <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                        DB match
                      </span>
                    ) : (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                        AI estimate
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-text-muted text-center">
            via {parser.data.provider} • Auto-closing in 3s...
          </p>
        </div>
      )}

      {/* Error */}
      {parser.isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-sm text-red-400">
            {parser.error?.message || "AI parsing failed"}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Try using the manual search instead.
          </p>
        </div>
      )}
    </div>
  );
}
