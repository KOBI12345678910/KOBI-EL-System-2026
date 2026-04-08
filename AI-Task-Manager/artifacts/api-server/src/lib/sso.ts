import { db } from "@workspace/db";
import { ssoProvidersTable, ssoSessionsTable, usersTable, roleAssignmentsTable, platformRolesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { loginOrCreateGoogleUser } from "./auth";

export interface SsoProviderConfig {
  type: "oauth2" | "saml";
  oauth2?: {
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
    redirectUri?: string;
  };
  saml?: {
    entryPoint: string;
    issuer: string;
    cert: string;
    callbackUrl?: string;
    signatureAlgorithm?: string;
  };
  attributeMapping?: {
    email?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    externalId?: string;
    groups?: string;
  };
}

export async function listSsoProviders() {
  const providers = await db.select({
    id: ssoProvidersTable.id,
    name: ssoProvidersTable.name,
    slug: ssoProvidersTable.slug,
    type: ssoProvidersTable.type,
    isActive: ssoProvidersTable.isActive,
    isAutoProvision: ssoProvidersTable.isAutoProvision,
    defaultRoleId: ssoProvidersTable.defaultRoleId,
    roleMappings: ssoProvidersTable.roleMappings,
    createdAt: ssoProvidersTable.createdAt,
    updatedAt: ssoProvidersTable.updatedAt,
  }).from(ssoProvidersTable);
  return providers;
}

export async function getSsoProvider(slugOrId: string | number) {
  const field = typeof slugOrId === "number"
    ? eq(ssoProvidersTable.id, slugOrId)
    : eq(ssoProvidersTable.slug, slugOrId);
  const [provider] = await db.select().from(ssoProvidersTable).where(field).limit(1);
  return provider || null;
}

export async function createSsoProvider(data: {
  name: string;
  slug: string;
  type: "oauth2" | "saml";
  config: SsoProviderConfig;
  defaultRoleId?: number;
  roleMappings?: Record<string, number>;
  isAutoProvision?: boolean;
}) {
  const [provider] = await db.insert(ssoProvidersTable).values({
    name: data.name,
    slug: data.slug,
    type: data.type,
    config: data.config as any,
    defaultRoleId: data.defaultRoleId || null,
    roleMappings: data.roleMappings || {},
    isAutoProvision: data.isAutoProvision ?? true,
  }).returning();
  return provider;
}

export async function updateSsoProvider(id: number, data: Partial<{
  name: string;
  config: SsoProviderConfig;
  defaultRoleId: number | null;
  roleMappings: Record<string, number>;
  isAutoProvision: boolean;
  isActive: boolean;
}>) {
  const [provider] = await db.update(ssoProvidersTable).set({
    ...data,
    config: data.config as any,
    updatedAt: new Date(),
  }).where(eq(ssoProvidersTable.id, id)).returning();
  return provider || null;
}

export async function deleteSsoProvider(id: number): Promise<boolean> {
  const result = await db.delete(ssoProvidersTable).where(eq(ssoProvidersTable.id, id)).returning();
  return result.length > 0;
}

export function generateSsoState(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSsoSession(providerId: number, state: string, relayState?: string) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const [session] = await db.insert(ssoSessionsTable).values({
    providerId,
    state,
    relayState: relayState || null,
    externalId: "",
    isCompleted: false,
    expiresAt,
  }).returning();
  return session;
}

export async function completeSsoSession(
  sessionId: number,
  userId: number,
  externalId: string
) {
  await db.update(ssoSessionsTable).set({
    userId,
    externalId,
    isCompleted: true,
  }).where(eq(ssoSessionsTable.id, sessionId));
}

export function buildOAuth2AuthorizationUrl(config: SsoProviderConfig["oauth2"]!, state: string): string {
  if (!config) throw new Error("OAuth2 config missing");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri || "",
    scope: config.scopes.join(" "),
    state,
  });
  return `${config.authorizationUrl}?${params.toString()}`;
}

export async function exchangeOAuth2Code(
  config: SsoProviderConfig["oauth2"]!,
  code: string
): Promise<{ accessToken: string; idToken?: string; expiresIn?: number }> {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri || "",
      code,
    }).toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth2 token exchange failed: ${text}`);
  }
  const data = await response.json() as any;
  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    expiresIn: data.expires_in,
  };
}

export async function fetchOAuth2UserInfo(
  config: SsoProviderConfig["oauth2"]!,
  accessToken: string
): Promise<Record<string, unknown>> {
  const response = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Failed to fetch user info from OAuth2 provider");
  return response.json() as Promise<Record<string, unknown>>;
}

export async function provisionSsoUser(
  provider: typeof ssoProvidersTable.$inferSelect,
  userInfo: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<{ token?: string; user?: Record<string, unknown>; error?: string }> {
  const config = provider.config as SsoProviderConfig;
  const mapping = config.attributeMapping || {};

  const emailField = mapping.email || "email";
  const nameField = mapping.name || "name";
  const email = String(userInfo[emailField] || "");
  const name = String(userInfo[nameField] || email.split("@")[0] || "sso-user");
  const externalId = String(userInfo[mapping.externalId || "sub"] || userInfo["id"] || email);

  if (!email) return { error: "No email provided by SSO provider" };

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (existingUser) {
    if (!existingUser.isActive) return { error: "Account is disabled" };

    await db.update(usersTable).set({
      lastLoginAt: new Date(),
      loginCount: existingUser.loginCount + 1,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, existingUser.id));

    const token = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + 72 * 3600000);
    const { userSessionsTable } = await import("@workspace/db/schema");
    await db.insert(userSessionsTable).values({
      userId: existingUser.id,
      token,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    });

    const { passwordHash: _, ...safeUser } = existingUser;
    return { token, user: safeUser as unknown as Record<string, unknown> };
  }

  if (!provider.isAutoProvision) {
    return { error: "User not found. Contact your administrator to provision access." };
  }

  const username = email.split("@")[0]!.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const passwordHash = crypto.randomBytes(32).toString("hex") + ":sso-no-password";

  const [newUser] = await db.insert(usersTable).values({
    username: `${username}_${crypto.randomBytes(3).toString("hex")}`,
    email,
    passwordHash,
    fullName: name,
    fullNameHe: name,
    isActive: true,
    isSuperAdmin: false,
  }).returning();

  if (provider.defaultRoleId) {
    await db.insert(roleAssignmentsTable).values({
      userId: String(newUser.id),
      roleId: provider.defaultRoleId,
      assignedBy: "sso-auto-provision",
    }).onConflictDoNothing();
  }

  const roleMappings = (provider.roleMappings as Record<string, number>) || {};
  const userGroups = String(userInfo[mapping.groups || "groups"] || "");
  if (userGroups && Object.keys(roleMappings).length > 0) {
    const groups = userGroups.split(",").map(g => g.trim());
    for (const group of groups) {
      if (roleMappings[group]) {
        await db.insert(roleAssignmentsTable).values({
          userId: String(newUser.id),
          roleId: roleMappings[group]!,
          assignedBy: "sso-group-mapping",
        }).onConflictDoNothing();
      }
    }
  }

  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 72 * 3600000);
  const { userSessionsTable } = await import("@workspace/db/schema");
  await db.insert(userSessionsTable).values({
    userId: newUser.id,
    token,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    expiresAt,
  });

  const { passwordHash: _, ...safeUser } = newUser;
  return { token, user: safeUser as unknown as Record<string, unknown> };
}

export function parseSamlResponse(samlResponse: string): Record<string, string> {
  try {
    const decoded = Buffer.from(samlResponse, "base64").toString("utf-8");
    const attributes: Record<string, string> = {};

    const emailMatch = decoded.match(/NameID[^>]*>([^<]+)</);
    if (emailMatch) attributes["email"] = emailMatch[1]!.trim();

    const attrMatches = decoded.matchAll(/AttributeName="([^"]+)"[^>]*>\s*<[^>]+>([^<]+)</g);
    for (const match of attrMatches) {
      attributes[match[1]!] = match[2]!.trim();
    }

    return attributes;
  } catch {
    return {};
  }
}

export function generateSamlMetadata(spConfig: { entityId: string; acsUrl: string; sloUrl?: string }): string {
  return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${spConfig.entityId}">
  <SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${spConfig.acsUrl}"
      index="1"/>
    ${spConfig.sloUrl ? `<SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${spConfig.sloUrl}"/>` : ""}
  </SPSSODescriptor>
</EntityDescriptor>`;
}
