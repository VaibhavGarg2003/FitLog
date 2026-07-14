/**
 * Auth Layout — Login/Signup Pages
 * ════════════════════════════════
 *
 * No bottom nav. Centered content. Clean, focused UI for auth forms.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Full-viewport shell; only the form card stays narrow for readability.
    <div className="w-full min-h-dvh bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  );
}
