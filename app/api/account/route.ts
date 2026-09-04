/**
 * GET    /api/account — whether account deletion is provisioned (env only)
 * DELETE /api/account — permanently delete the authenticated user's account
 *
 * Deletion requires `{ confirm: "DELETE" }`, calls private.delete_user_account
 * via the fitlog_deleter client, then signs the user out server-side.
 * Deleting auth.users does NOT invalidate an already-issued JWT until expiry,
 * so the sign-out is mandatory, not cosmetic.
 *
 * Feature is inert until ACCOUNT_DELETION_DATABASE_URL is set and
 * db/roles/002_delete_user_account.sql has been applied as postgres.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthUserId } from "@/lib/supabase/server";
import {
  deleteUserAccount,
  isAccountDeletionProvisioned,
} from "@/lib/repositories/account.repository";
import { deleteAccountSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      deletionAvailable: isAccountDeletionProvisioned(),
    });
  } catch (error) {
    return handleRouteError(error, "GET /api/account");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Confirmation required",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    await deleteUserAccount(userId);

    // Mandatory: JWT remains valid until expiry even after auth.users is gone.
    const supabase = await createClient();
    await supabase.auth.signOut();

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/account");
  }
}
