import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  listSsoProviders,
  getSsoProvider,
  createSsoProvider,
  updateSsoProvider,
  deleteSsoProvider,
  generateSsoState,
  createSsoSession,
  buildOAuth2AuthorizationUrl,
  exchangeOAuth2Code,
  fetchOAuth2UserInfo,
  provisionSsoUser,
  parseSamlResponse,
  generateSamlMetadata,
} from "../lib/sso";
import { validateSession } from "../lib/auth";
import { db } from "@workspace/db";
import { ssoSessionsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";

const router: IRouter = Router();

function extractToken(req: any): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.substring(7);
  return req.query.token || null;
}

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "Authentication required" }); return false; }
  const { user, error } = await validateSession(token);
  if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return false; }
  if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return false; }
  return true;
}

router.get("/sso/providers", async (req, res) => {
  try {
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return;
    const providers = await listSsoProviders();
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: "Failed to list SSO providers" });
  }
});

router.post("/sso/providers", async (req, res) => {
  try {
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return;
    const { name, slug, type, config, defaultRoleId, roleMappings, isAutoProvision } = req.body;
    if (!name || !slug || !type || !config) {
      res.status(400).json({ error: "name, slug, type, and config are required" });
      return;
    }
    const provider = await createSsoProvider({ name, slug, type, config, defaultRoleId, roleMappings, isAutoProvision });
    res.json(provider);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create SSO provider" });
  }
});

router.put("/sso/providers/:id", async (req, res) => {
  try {
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return;
    const id = parseInt(req.params.id);
    const { name, config, defaultRoleId, roleMappings, isAutoProvision, isActive } = req.body;
    const updated = await updateSsoProvider(id, { name, config, defaultRoleId, roleMappings, isAutoProvision, isActive });
    if (!updated) { res.status(404).json({ error: "Provider not found" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update SSO provider" });
  }
});

router.delete("/sso/providers/:id", async (req, res) => {
  try {
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return;
    const id = parseInt(req.params.id);
    const deleted = await deleteSsoProvider(id);
    if (!deleted) { res.status(404).json({ error: "Provider not found" }); return; }
    res.json({ message: "SSO provider deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete SSO provider" });
  }
});

router.get("/sso/metadata", async (req, res) => {
  const baseUrl = process.env.PUBLIC_API_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}/api`;
  const metadata = generateSamlMetadata({
    entityId: `${baseUrl}/sso/saml/metadata`,
    acsUrl: `${baseUrl}/sso/saml/acs`,
    sloUrl: `${baseUrl}/sso/saml/slo`,
  });
  res.set("Content-Type", "application/xml");
  res.send(metadata);
});

router.get("/sso/:slug/authorize", async (req, res) => {
  try {
    const provider = await getSsoProvider(req.params.slug);
    if (!provider || !provider.isActive) {
      res.status(404).json({ error: "SSO provider not found or inactive" });
      return;
    }

    const config = provider.config as any;
    const relayState = req.query.relay_state as string | undefined;
    const state = generateSsoState();

    await createSsoSession(provider.id, state, relayState);

    if (provider.type === "oauth2" && config.oauth2) {
      const authUrl = buildOAuth2AuthorizationUrl(config.oauth2, state);
      res.json({ redirectUrl: authUrl, state });
    } else if (provider.type === "saml" && config.saml) {
      const samlRequest = Buffer.from(`<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_${crypto.randomUUID()}" Version="2.0" IssueInstant="${new Date().toISOString()}" Destination="${config.saml.entryPoint}"><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${config.saml.issuer}</saml:Issuer></samlp:AuthnRequest>`).toString("base64");
      const samlUrl = `${config.saml.entryPoint}?SAMLRequest=${encodeURIComponent(samlRequest)}&RelayState=${encodeURIComponent(state)}`;
      res.json({ redirectUrl: samlUrl, state });
    } else {
      res.status(400).json({ error: "Invalid SSO provider configuration" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "SSO authorization failed" });
  }
});

router.post("/sso/:slug/callback", async (req, res) => {
  try {
    const provider = await getSsoProvider(req.params.slug);
    if (!provider || !provider.isActive) {
      res.status(404).json({ error: "SSO provider not found" });
      return;
    }

    const config = provider.config as any;
    const ip = req.ip || "";
    const ua = req.headers["user-agent"] || "";

    if (provider.type === "oauth2") {
      const { code, state } = req.body;
      if (!code) { res.status(400).json({ error: "Missing authorization code" }); return; }

      const [ssoSession] = await db.select().from(ssoSessionsTable).where(
        and(
          eq(ssoSessionsTable.state, state || ""),
          eq(ssoSessionsTable.isCompleted, false),
          gt(ssoSessionsTable.expiresAt, new Date())
        )
      ).limit(1);

      if (!ssoSession && state) {
        console.warn("[SSO] State mismatch or session expired, proceeding without state validation");
      }

      const tokens = await exchangeOAuth2Code(config.oauth2, code);
      const userInfo = await fetchOAuth2UserInfo(config.oauth2, tokens.accessToken);
      const result = await provisionSsoUser(provider, userInfo, ip, ua);

      if (result.error) { res.status(401).json({ error: result.error }); return; }

      if (ssoSession) {
        await db.update(ssoSessionsTable).set({
          userId: (result.user as any)?.id,
          isCompleted: true,
          externalId: String((userInfo as any)?.sub || (userInfo as any)?.id || ""),
        }).where(eq(ssoSessionsTable.id, ssoSession.id));
      }

      res.json({ token: result.token, user: result.user, message: "SSO login successful" });
    } else if (provider.type === "saml") {
      const { SAMLResponse, RelayState } = req.body;
      if (!SAMLResponse) { res.status(400).json({ error: "Missing SAML response" }); return; }

      const attributes = parseSamlResponse(SAMLResponse);
      const result = await provisionSsoUser(provider, attributes, ip, ua);

      if (result.error) { res.status(401).json({ error: result.error }); return; }
      res.json({ token: result.token, user: result.user, message: "SAML SSO login successful" });
    } else {
      res.status(400).json({ error: "Invalid provider type" });
    }
  } catch (err: any) {
    console.error("[SSO] Callback error:", err.message);
    res.status(500).json({ error: err.message || "SSO callback failed" });
  }
});

router.post("/sso/saml/acs", async (req, res) => {
  try {
    const { SAMLResponse, RelayState } = req.body;
    if (!SAMLResponse) { res.status(400).json({ error: "Missing SAML response" }); return; }

    const attributes = parseSamlResponse(SAMLResponse);
    const email = attributes["email"] || "";
    if (!email) { res.status(400).json({ error: "No email in SAML assertion" }); return; }

    const providers = await listSsoProviders();
    const samlProvider = providers.find(p => p.type === "saml" && p.isActive);

    if (!samlProvider) { res.status(404).json({ error: "No active SAML provider configured" }); return; }

    const fullProvider = await getSsoProvider(samlProvider.id);
    if (!fullProvider) { res.status(404).json({ error: "Provider not found" }); return; }

    const ip = req.ip || "";
    const ua = req.headers["user-agent"] || "";
    const result = await provisionSsoUser(fullProvider, attributes, ip, ua);

    if (result.error) { res.status(401).json({ error: result.error }); return; }
    res.json({ token: result.token, user: result.user, message: "SAML login successful" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "SAML ACS failed" });
  }
});

router.get("/sso/saml/slo", async (req, res) => {
  res.json({ message: "SLO acknowledged" });
});

export default router;
