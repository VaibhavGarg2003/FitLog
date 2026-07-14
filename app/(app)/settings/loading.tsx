import { PageSkeleton } from "@/components/shared/page-skeleton";

// Shown instantly on navigation to /settings while the page streams in.
export default function Loading() {
  return <PageSkeleton title="Settings" columns={2} cards={3} />;
}
