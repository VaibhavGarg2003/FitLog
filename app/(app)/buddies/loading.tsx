import { PageSkeleton } from "@/components/shared/page-skeleton";

// Shown instantly on navigation to /buddies while the page streams in.
export default function Loading() {
  return <PageSkeleton title="Buddies" cards={1} />;
}
