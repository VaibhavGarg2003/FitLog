import { PageSkeleton } from "@/components/shared/page-skeleton";

// Shown instantly on navigation to /workout while the page streams in.
export default function Loading() {
  return (
    <PageSkeleton
      title="Workout"
      subtitle="Log your gym session"
      columns={1}
      cards={3}
    />
  );
}
