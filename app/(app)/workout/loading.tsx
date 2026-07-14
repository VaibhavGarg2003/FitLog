import { PageSkeleton } from "@/components/shared/page-skeleton";

// Shown instantly on navigation to /workout while the page streams in.
export default function Loading() {
  return (
    <PageSkeleton
      title="Workout"
      subtitle="Log your gym session"
      columns={2}
      cards={4}
    />
  );
}
