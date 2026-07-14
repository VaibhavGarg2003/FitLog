import { PageSkeleton } from "@/components/shared/page-skeleton";

// Shown instantly on navigation to /progress while the page streams in.
export default function Loading() {
  return (
    <PageSkeleton
      title="Progress"
      subtitle="Track your body transformation"
      columns={2}
      cards={4}
    />
  );
}
