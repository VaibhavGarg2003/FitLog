import { PageSkeleton } from "@/components/shared/page-skeleton";

// Shown instantly on navigation to /chat while the page streams in.
export default function Loading() {
  return <PageSkeleton title="Chat" cards={1} />;
}
