import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile, createDirectory } from "./fileTool";
import { runCommand } from "./terminalTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function setupStripe(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n💳 Setting up Stripe...");

  await runCommand({ command: `cd ${WORKSPACE} && npm install stripe @stripe/stripe-js`, timeout: 30000 });

  await createDirectory({ path: `${WORKSPACE}/src/payments` });
  await writeFile({ path: `${WORKSPACE}/src/payments/stripe.ts`, content: `import Stripe from 'stripe';
import { Router, Request, Response } from 'express';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-12-18.acacia' });

export const paymentRouter = Router();

paymentRouter.post('/create-checkout', async (req: Request, res: Response) => {
  const { priceId, successUrl, cancelUrl } = req.body;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl || \`\${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}\`,
    cancel_url: cancelUrl || \`\${req.headers.origin}/cancel\`,
  });
  res.json({ url: session.url, sessionId: session.id });
});

paymentRouter.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).send('Webhook Error: ' + err.message);
  }
  switch (event.type) {
    case 'checkout.session.completed': console.log('Payment succeeded:', event.data.object); break;
    case 'customer.subscription.updated': console.log('Subscription updated:', event.data.object); break;
    case 'customer.subscription.deleted': console.log('Subscription cancelled:', event.data.object); break;
  }
  res.json({ received: true });
});

paymentRouter.post('/create-portal', async (req: Request, res: Response) => {
  const { customerId } = req.body;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: \`\${req.headers.origin}/account\`,
  });
  res.json({ url: session.url });
});
` });

  await createDirectory({ path: `${WORKSPACE}/src/components/Payments` });
  await writeFile({ path: `${WORKSPACE}/src/components/Payments/CheckoutButton.tsx`, content: `import { useState } from 'react';

export function CheckoutButton({ priceId, label = 'Subscribe' }: { priceId: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Checkout error:', err);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-all"
    >
      {loading ? 'Redirecting...' : label}
    </button>
  );
}
` });

  return { success: true, output: "Stripe setup complete: server routes + CheckoutButton component. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars." };
}

export async function setupAnalytics(params: {
  provider: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n📊 Setting up analytics: ${params.provider}`);

  const configs: Record<string, { pkg: string; code: string; envVar: string }> = {
    mixpanel: {
      pkg: "mixpanel-browser",
      envVar: "NEXT_PUBLIC_MIXPANEL_TOKEN",
      code: `import mixpanel from 'mixpanel-browser';

mixpanel.init(process.env.NEXT_PUBLIC_MIXPANEL_TOKEN!);

export const analytics = {
  track: (event: string, props?: Record<string, any>) => mixpanel.track(event, props),
  identify: (userId: string, traits?: Record<string, any>) => { mixpanel.identify(userId); if (traits) mixpanel.people.set(traits); },
  page: (name: string) => mixpanel.track('Page View', { page: name }),
  reset: () => mixpanel.reset(),
};`,
    },
    ga4: {
      pkg: "",
      envVar: "NEXT_PUBLIC_GA_ID",
      code: `declare global { interface Window { gtag: (...args: any[]) => void; dataLayer: any[]; } }

const GA_ID = process.env.NEXT_PUBLIC_GA_ID!;

export function initGA() {
  const script = document.createElement('script');
  script.src = \`https://www.googletagmanager.com/gtag/js?id=\${GA_ID}\`;
  script.async = true;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

export const analytics = {
  track: (event: string, params?: Record<string, any>) => window.gtag?.('event', event, params),
  page: (path: string) => window.gtag?.('config', GA_ID, { page_path: path }),
};`,
    },
    posthog: {
      pkg: "posthog-js",
      envVar: "NEXT_PUBLIC_POSTHOG_KEY",
      code: `import posthog from 'posthog-js';

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
});

export const analytics = {
  track: (event: string, props?: Record<string, any>) => posthog.capture(event, props),
  identify: (userId: string, traits?: Record<string, any>) => posthog.identify(userId, traits),
  page: () => posthog.capture('$pageview'),
  reset: () => posthog.reset(),
};`,
    },
    plausible: {
      pkg: "plausible-tracker",
      envVar: "NEXT_PUBLIC_PLAUSIBLE_DOMAIN",
      code: `import Plausible from 'plausible-tracker';

const plausible = Plausible({ domain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN! });

export const analytics = {
  track: (event: string, props?: Record<string, any>) => plausible.trackEvent(event, { props }),
  page: () => plausible.trackPageview(),
};`,
    },
  };

  const config = configs[params.provider];
  if (!config) return { success: false, output: `Unknown provider: ${params.provider}. Available: mixpanel, ga4, posthog, plausible` };

  if (config.pkg) await runCommand({ command: `cd ${WORKSPACE} && npm install ${config.pkg}`, timeout: 30000 });

  await createDirectory({ path: `${WORKSPACE}/src/lib` });
  await writeFile({ path: `${WORKSPACE}/src/lib/analytics.ts`, content: config.code });

  return { success: true, output: `Analytics (${params.provider}) setup at src/lib/analytics.ts. Set ${config.envVar} env var.` };
}

export async function setupSentry(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n🐛 Setting up Sentry...");

  await runCommand({ command: `cd ${WORKSPACE} && npm install @sentry/node @sentry/react`, timeout: 30000 });

  await createDirectory({ path: `${WORKSPACE}/src/lib` });
  await writeFile({ path: `${WORKSPACE}/src/lib/sentry.ts`, content: `import * as Sentry from '@sentry/node';

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
  });
}

export function captureError(error: Error, context?: Record<string, any>) {
  Sentry.withScope(scope => {
    if (context) scope.setExtras(context);
    Sentry.captureException(error);
  });
}

export function sentryErrorHandler() { return Sentry.expressErrorHandler(); }
export function sentryRequestHandler() { return Sentry.expressRequestHandler(); }
` });

  await writeFile({ path: `${WORKSPACE}/src/lib/sentry-client.tsx`, content: `import * as Sentry from '@sentry/react';

export function initSentryClient() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
` });

  return { success: true, output: "Sentry setup complete: server + client. Set SENTRY_DSN env var." };
}

export async function setupSearch(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n🔍 Setting up Meilisearch...");

  await runCommand({ command: `cd ${WORKSPACE} && npm install meilisearch`, timeout: 30000 });

  await createDirectory({ path: `${WORKSPACE}/src/services` });
  await writeFile({ path: `${WORKSPACE}/src/services/search.ts`, content: `import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
  apiKey: process.env.MEILISEARCH_API_KEY,
});

export class SearchService {
  async createIndex(indexName: string, primaryKey = 'id') {
    return client.createIndex(indexName, { primaryKey });
  }

  async indexDocuments(indexName: string, documents: any[]) {
    return client.index(indexName).addDocuments(documents);
  }

  async search(indexName: string, query: string, options?: {
    limit?: number; offset?: number; filter?: string; sort?: string[]; facets?: string[];
  }) {
    return client.index(indexName).search(query, {
      limit: options?.limit || 20, offset: options?.offset || 0,
      filter: options?.filter, sort: options?.sort, facets: options?.facets,
    });
  }

  async updateSettings(indexName: string, settings: {
    searchableAttributes?: string[]; filterableAttributes?: string[]; sortableAttributes?: string[];
  }) {
    return client.index(indexName).updateSettings(settings);
  }

  async deleteDocument(indexName: string, id: string | number) {
    return client.index(indexName).deleteDocument(id);
  }

  async deleteIndex(indexName: string) { return client.deleteIndex(indexName); }
}

export const searchService = new SearchService();
` });

  return { success: true, output: "Meilisearch setup at src/services/search.ts. Set MEILISEARCH_HOST and MEILISEARCH_API_KEY env vars." };
}

export async function setupPDFGen(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n📄 Setting up PDF generation...");

  await runCommand({ command: `cd ${WORKSPACE} && npm install puppeteer-core @sparticuz/chromium`, timeout: 60000 });

  await createDirectory({ path: `${WORKSPACE}/src/services` });
  await writeFile({ path: `${WORKSPACE}/src/services/pdf.ts`, content: `import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function generatePDF(options: {
  html?: string; url?: string; format?: 'A4' | 'Letter'; landscape?: boolean;
  margin?: { top: string; bottom: string; left: string; right: string };
  headerTemplate?: string; footerTemplate?: string;
}): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args, defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath() || '/usr/bin/chromium-browser',
    headless: true,
  });

  const page = await browser.newPage();
  if (options.url) await page.goto(options.url, { waitUntil: 'networkidle0' });
  else if (options.html) await page.setContent(options.html, { waitUntil: 'networkidle0' });

  const pdf = await page.pdf({
    format: options.format || 'A4', landscape: options.landscape || false, printBackground: true,
    margin: options.margin || { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
    displayHeaderFooter: !!(options.headerTemplate || options.footerTemplate),
    headerTemplate: options.headerTemplate || '',
    footerTemplate: options.footerTemplate || '<div style="font-size:8px;text-align:center;width:100%"><span class="pageNumber"></span>/<span class="totalPages"></span></div>',
  });

  await browser.close();
  return Buffer.from(pdf);
}

import { Router, Request, Response } from 'express';
export const pdfRouter = Router();

pdfRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const pdf = await generatePDF(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="document.pdf"');
    res.send(pdf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
` });

  return { success: true, output: "PDF generation setup at src/services/pdf.ts with Express route." };
}

export async function setupEnvironments(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n🌍 Setting up environment configs...");

  await createDirectory({ path: `${WORKSPACE}/src/config` });
  await writeFile({ path: `${WORKSPACE}/src/config/environments.ts`, content: `export type Environment = 'development' | 'staging' | 'production';

export const env: Environment = (process.env.NODE_ENV as Environment) || 'development';

const configs: Record<Environment, {
  apiUrl: string; dbUrl: string; redisUrl: string; logLevel: string; debug: boolean;
}> = {
  development: {
    apiUrl: 'http://localhost:3000',
    dbUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/app_dev',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    logLevel: 'debug', debug: true,
  },
  staging: {
    apiUrl: process.env.STAGING_API_URL || 'https://staging.app.com',
    dbUrl: process.env.STAGING_DATABASE_URL || '',
    redisUrl: process.env.STAGING_REDIS_URL || '',
    logLevel: 'info', debug: false,
  },
  production: {
    apiUrl: process.env.PRODUCTION_API_URL || 'https://app.com',
    dbUrl: process.env.DATABASE_URL || '',
    redisUrl: process.env.REDIS_URL || '',
    logLevel: 'warn', debug: false,
  },
};

export const config = configs[env];

export function isProduction(): boolean { return env === 'production'; }
export function isDevelopment(): boolean { return env === 'development'; }
export function isStaging(): boolean { return env === 'staging'; }
` });

  await writeFile({ path: `${WORKSPACE}/.env.development`, content: `NODE_ENV=development\nPORT=3000\nDATABASE_URL=postgresql://localhost:5432/app_dev\nREDIS_URL=redis://localhost:6379\n` });
  await writeFile({ path: `${WORKSPACE}/.env.staging`, content: `NODE_ENV=staging\nPORT=3000\n# Fill in staging values\n` });
  await writeFile({ path: `${WORKSPACE}/.env.production`, content: `NODE_ENV=production\nPORT=3000\n# Fill in production values\n` });

  return { success: true, output: "Environment configs created: development, staging, production + .env files." };
}

export const INTEGRATIONS_TOOLS = [
  {
    name: "setup_stripe_payments",
    description: "התקנת Stripe מלא — checkout, webhook, portal, CheckoutButton component",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "setup_analytics",
    description: "התקנת analytics — Mixpanel, GA4, PostHog, או Plausible",
    input_schema: {
      type: "object" as const,
      properties: {
        provider: { type: "string", description: "mixpanel, ga4, posthog, plausible" },
      },
      required: ["provider"] as string[],
    },
  },
  {
    name: "setup_sentry",
    description: "התקנת Sentry — error tracking, server + client, Express middleware",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "setup_meilisearch",
    description: "התקנת Meilisearch — full-text search service עם CRUD מלא",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "setup_pdf_generation",
    description: "התקנת PDF generation — Puppeteer + Chromium, Express route",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "setup_environments",
    description: "הגדרת סביבות — development/staging/production configs + .env files",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
