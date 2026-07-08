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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* flex items-center justify-center → vertically and horizontally
          centers the login form on the page. Classic centering pattern. */}
      <div className="w-full max-w-sm">
        {/* max-w-sm → 384px max width. Login forms shouldn't be wide. */}
        {children}
      </div>
    </div>
  );
}
