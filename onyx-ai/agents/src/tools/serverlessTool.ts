import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile, createDirectory } from "./fileTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function generateLambda(params: {
  name: string;
  description: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n\u2601 Generating Lambda: ${params.name}`);

  const response = await callLLM({
    system: "Generate an AWS Lambda function with TypeScript. Include handler, types, error handling, and SAM template. Respond with ONLY code.",
    messages: [{ role: "user", content: `Lambda "${params.name}": ${params.description}` }],
  });

  let code = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const dir = `${WORKSPACE}/functions/${params.name}`;
  await createDirectory({ path: dir });
  await writeFile({ path: `${dir}/handler.ts`, content: code });

  await writeFile({ path: `${dir}/template.yaml`, content: `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  ${params.name}Function:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handler.handler
      Runtime: nodejs20.x
      Timeout: 30
      MemorySize: 256
      Events:
        Api:
          Type: Api
          Properties:
            Path: /${params.name}
            Method: ANY
` });

  return { success: true, output: `Lambda "${params.name}" created at ${dir}/handler.ts with SAM template` };
}

export async function generateWorker(params: {
  name: string;
  description: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n\u2601 Generating Cloudflare Worker: ${params.name}`);

  const response = await callLLM({
    system: "Generate a Cloudflare Worker with TypeScript. Include itty-router, error handling, CORS, and wrangler.toml. Respond with ONLY code.",
    messages: [{ role: "user", content: `Worker "${params.name}": ${params.description}` }],
  });

  let code = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const dir = `${WORKSPACE}/workers/${params.name}`;
  await createDirectory({ path: `${dir}/src` });
  await writeFile({ path: `${dir}/src/index.ts`, content: code });

  await writeFile({ path: `${dir}/wrangler.toml`, content: `name = "${params.name}"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"
` });

  return { success: true, output: `Worker "${params.name}" created at ${dir}/src/index.ts with wrangler.toml` };
}

export async function generateEdgeFunction(params: {
  name: string;
  description: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n\u26A1 Generating Edge Function: ${params.name}`);

  const response = await callLLM({
    system: "Generate a Vercel Edge Function. Include Response handling, headers, streaming support. Respond with ONLY code.",
    messages: [{ role: "user", content: `Edge function "${params.name}": ${params.description}` }],
  });

  let code = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const filePath = `${WORKSPACE}/api/${params.name}.ts`;
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await createDirectory({ path: dir });
  await writeFile({ path: filePath, content: code });

  return { success: true, output: `Edge function "${params.name}" created at ${filePath}` };
}

export async function generateK8sManifests(params: {
  appName: string;
  replicas?: number;
  port?: number;
  image?: string;
  cpu?: string;
  memory?: string;
  ingress?: boolean;
  hpa?: boolean;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n\u2638 Generating K8s manifests: ${params.appName}`);

  const replicas = params.replicas || 2;
  const port = params.port || 3000;
  const image = params.image || `${params.appName}:latest`;
  const cpu = params.cpu || "250m";
  const mem = params.memory || "256Mi";
  const ingressEnabled = params.ingress !== false;
  const hpaEnabled = !!params.hpa;

  const k8sDir = `${WORKSPACE}/k8s/${params.appName}`;
  const helmDir = `${WORKSPACE}/helm/${params.appName}`;
  await createDirectory({ path: k8sDir });
  await createDirectory({ path: helmDir });

  await writeFile({ path: `${k8sDir}/deployment.yaml`, content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${params.appName}
  labels:
    app: ${params.appName}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${params.appName}
  template:
    metadata:
      labels:
        app: ${params.appName}
    spec:
      containers:
        - name: ${params.appName}
          image: ${image}
          ports:
            - containerPort: ${port}
          resources:
            requests:
              cpu: ${cpu}
              memory: ${mem}
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /api/health
              port: ${port}
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: ${port}
            initialDelaySeconds: 5
            periodSeconds: 5
          envFrom:
            - configMapRef:
                name: ${params.appName}-config
            - secretRef:
                name: ${params.appName}-secrets
` });

  await writeFile({ path: `${k8sDir}/service.yaml`, content: `apiVersion: v1
kind: Service
metadata:
  name: ${params.appName}
spec:
  type: ClusterIP
  selector:
    app: ${params.appName}
  ports:
    - port: 80
      targetPort: ${port}
      protocol: TCP
` });

  if (ingressEnabled) {
    await writeFile({ path: `${k8sDir}/ingress.yaml`, content: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${params.appName}
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - ${params.appName}.example.com
      secretName: ${params.appName}-tls
  rules:
    - host: ${params.appName}.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${params.appName}
                port:
                  number: 80
` });
  }

  if (hpaEnabled) {
    await writeFile({ path: `${k8sDir}/hpa.yaml`, content: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${params.appName}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${params.appName}
  minReplicas: ${replicas}
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
` });
  }

  await writeFile({ path: `${k8sDir}/configmap.yaml`, content: `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${params.appName}-config
data:
  NODE_ENV: "production"
  PORT: "${port}"
` });

  const kustomizeResources = ['  - deployment.yaml', '  - service.yaml'];
  if (ingressEnabled) kustomizeResources.push('  - ingress.yaml');
  if (hpaEnabled) kustomizeResources.push('  - hpa.yaml');
  kustomizeResources.push('  - configmap.yaml');

  await writeFile({ path: `${k8sDir}/kustomization.yaml`, content: `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
${kustomizeResources.join('\n')}
` });

  await writeFile({ path: `${helmDir}/Chart.yaml`, content: `apiVersion: v2
name: ${params.appName}
description: Helm chart for ${params.appName}
version: 1.0.0
appVersion: "1.0.0"
` });

  await writeFile({ path: `${helmDir}/values.yaml`, content: `replicaCount: ${replicas}
image:
  repository: ${params.appName}
  tag: latest
  pullPolicy: IfNotPresent
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: ${ingressEnabled}
  host: ${params.appName}.example.com
resources:
  requests:
    cpu: ${cpu}
    memory: ${mem}
  limits:
    cpu: 500m
    memory: 512Mi
autoscaling:
  enabled: ${hpaEnabled}
  minReplicas: ${replicas}
  maxReplicas: 10
` });

  const fileCount = 4 + (ingressEnabled ? 1 : 0) + (hpaEnabled ? 1 : 0) + 2;
  return { success: true, output: `K8s manifests + Helm chart for "${params.appName}" created (${fileCount} files)` };
}

export async function generateTerraform(params: {
  provider: string;
  resources: string[];
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n\uD83C\uDF0D Generating Terraform: ${params.provider}`);

  const response = await callLLM({
    system: `Generate Terraform configuration for ${params.provider}. Include provider setup, variables, outputs.
Resources needed: ${params.resources.join(", ")}. Respond with ONLY the HCL code.`,
    messages: [{ role: "user", content: `Generate Terraform for ${params.provider}: ${params.resources.join(", ")}` }],
    maxTokens: 4096,
  });

  let code = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const dir = `${WORKSPACE}/terraform`;
  await createDirectory({ path: dir });
  await writeFile({ path: `${dir}/main.tf`, content: code });

  return { success: true, output: `Terraform config for ${params.provider} created at ${dir}/main.tf` };
}

export const SERVERLESS_TOOLS = [
  {
    name: "generate_lambda",
    description: "יצירת AWS Lambda function — TypeScript handler + SAM template",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "שם הפונקציה" },
        description: { type: "string", description: "מה הפונקציה עושה" },
      },
      required: ["name", "description"] as string[],
    },
  },
  {
    name: "generate_cloudflare_worker",
    description: "יצירת Cloudflare Worker — TypeScript + itty-router + wrangler.toml",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "שם ה-Worker" },
        description: { type: "string", description: "מה ה-Worker עושה" },
      },
      required: ["name", "description"] as string[],
    },
  },
  {
    name: "generate_edge_function",
    description: "יצירת Vercel Edge Function — streaming, headers, response handling",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "שם הפונקציה" },
        description: { type: "string", description: "מה הפונקציה עושה" },
      },
      required: ["name", "description"] as string[],
    },
  },
  {
    name: "generate_k8s_manifests",
    description: "יצירת Kubernetes manifests + Helm chart — Deployment, Service, Ingress, HPA, ConfigMap",
    input_schema: {
      type: "object" as const,
      properties: {
        appName: { type: "string", description: "שם האפליקציה" },
        replicas: { type: "number", description: "כמות רפליקות (ברירת מחדל: 2)" },
        port: { type: "number", description: "פורט (ברירת מחדל: 3000)" },
        image: { type: "string", description: "Docker image" },
        cpu: { type: "string", description: "CPU request (ברירת מחדל: 250m)" },
        memory: { type: "string", description: "Memory request (ברירת מחדל: 256Mi)" },
        ingress: { type: "boolean", description: "כולל Ingress? (ברירת מחדל: true)" },
        hpa: { type: "boolean", description: "כולל HPA autoscaling?" },
      },
      required: ["appName"] as string[],
    },
  },
  {
    name: "generate_terraform",
    description: "יצירת Terraform configuration — AWS/GCP/Azure, provider setup, variables, outputs",
    input_schema: {
      type: "object" as const,
      properties: {
        provider: { type: "string", description: "ספק: aws, gcp, azure" },
        resources: { type: "array", items: { type: "string" }, description: "רשימת משאבים" },
      },
      required: ["provider", "resources"] as string[],
    },
  },
];
