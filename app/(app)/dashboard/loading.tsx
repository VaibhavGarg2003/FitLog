import { PageSkeleton } from "@/components/shared/page-skeleton";

// Shown instantly on navigation to /dashboard while the page streams in.
export default function Loading() {
  return (
    <PageSkeleton
      title="Dashboard"
      subtitle="Your daily overview"
      columns={2}
      cards={4}
    />
  );
}
