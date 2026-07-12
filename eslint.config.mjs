import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── Architecture guard: the DAO rule as a LINT RULE ──────────────
  // CONTEXT.md Rule 4: all physical data access lives in lib/repositories/.
  // A convention only survives if a machine enforces it — this turns
  // "please don't import prisma in services" into a CI failure.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/prisma",
              message:
                "Data access lives in lib/repositories/ (CONTEXT.md Rule 4). " +
                "Import a repository function instead of prisma directly.",
            },
          ],
        },
      ],
    },
  },
  // The allowed zones: repositories own queries; lib/supabase owns the
  // client itself; prisma/ holds seeds; /api/health is a liveness probe
  // (SELECT 1 — infrastructure, not data access).
  {
    files: [
      "lib/repositories/**",
      "lib/supabase/**",
      "prisma/**",
      "app/api/health/**",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
