/**
 * Invite landing page — /buddies/invite/<code> (what a buddy QR code opens).
 *
 * Server-rendered so the invite owner shows immediately. Opening the page
 * never connects anyone; the visitor taps "Add as buddy" (a POST). Lives in
 * the (app) group, so a signed-out visitor goes through login and comes back.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/supabase/server";
import { lookupByInviteCode } from "@/lib/services/social.service";
import { inviteCodeSchema } from "@/lib/validators/chat.schema";
import { NotFoundError } from "@/lib/utils/errors";
import { InviteAccept } from "@/components/chat/invite-accept";

export const metadata = {
  title: "Buddy invite",
  robots: { index: false, follow: false },
};

function Invalid() {
  return (
    <div className="mx-auto max-w-md space-y-3 text-center">
      <p className="text-sm text-text-secondary">
        This invite isn’t valid any more. Ask your friend for a new QR code or link.
      </p>
      <Link href="/buddies" className="text-sm text-primary hover:underline">
        Go to Buddies
      </Link>
    </div>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");

  const { code } = await params;
  const parsed = inviteCodeSchema.safeParse(code);
  if (!parsed.success) return <Invalid />;

  let invite: Awaited<ReturnType<typeof lookupByInviteCode>>;
  try {
    invite = await lookupByInviteCode(userId, parsed.data);
  } catch (error) {
    if (error instanceof NotFoundError) return <Invalid />;
    throw error;
  }

  return (
    <InviteAccept
      code={parsed.data}
      owner={invite.user}
      relationship={invite.relationship}
      isSelf={invite.user.userId === userId}
    />
  );
}
