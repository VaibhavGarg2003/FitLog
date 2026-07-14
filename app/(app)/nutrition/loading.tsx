import { PageSkeleton } from "@/components/shared/page-skeleton";

// Shown instantly on navigation to /nutrition while the page streams in.
export default function Loading() {
  return (
    <PageSkeleton
      title="Nutrition"
      subtitle="Track what you eat today"
      columns={2}
      cards={4}
    />
  );
}
