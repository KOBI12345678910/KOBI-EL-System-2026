import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { UnauthorizedError } from "./errors.ts";

export type ActorIdentity = {
  authUserId: string;
  userProfileId: number;
  email?: string;
  fullName?: string;
};

export async function requireInternalUser(
  req: Request,
  admin: SupabaseClient,
): Promise<ActorIdentity> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new UnauthorizedError("Missing Authorization header");

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new UnauthorizedError("Invalid or expired token");

  const { data: profile, error: profileError } = await admin
    .schema("governance")
    .from("users_profile")
    .select("id, full_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new UnauthorizedError("User profile not found");

  return {
    authUserId: user.id,
    userProfileId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
  };
}
