import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { writeFile } from "./fileTool";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const UPLOADS_DIR = path.join(WORKSPACE_DIR, "uploads");

interface UploadedFile { id: string; originalName: string; storedPath: string; mimeType: string; size: number; uploadedAt: string; metadata?: Record<string, any> }
const uploads = new Map<string, UploadedFile>();

function ensureUploadsDir() { if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true }); }

export async function uploadFile(params: { sourcePath: string; originalName?: string; metadata?: Record<string, any> }): Promise<{ success: boolean; output: string }> {
  ensureUploadsDir();
  const srcPath = path.isAbsolute(params.sourcePath) ? params.sourcePath : path.join(WORKSPACE_DIR, params.sourcePath);
  if (!fs.existsSync(srcPath)) return { success: false, output: `Source not found: ${params.sourcePath}` };

  const id = crypto.randomUUID();
  const ext = path.extname(srcPath);
  const storedName = `${id}${ext}`;
  const storedPath = path.join(UPLOADS_DIR, storedName);
  fs.copyFileSync(srcPath, storedPath);

  const stat = fs.statSync(storedPath);
  const file: UploadedFile = { id, originalName: params.originalName || path.basename(srcPath), storedPath: `uploads/${storedName}`, mimeType: getMimeType(ext), size: stat.size, uploadedAt: new Date().toISOString(), metadata: params.metadata };
  uploads.set(id, file);
  return { success: true, output: `Uploaded: ${file.originalName} → ${file.storedPath}\nID: ${id} | Size: ${(file.size / 1024).toFixed(1)}KB` };
}

export async function getUploadedFile(params: { id: string }): Promise<{ success: boolean; output: string }> {
  const file = uploads.get(params.id);
  if (!file) return { success: false, output: `File ${params.id} not found` };
  return { success: true, output: JSON.stringify(file, null, 2) };
}

export async function deleteUploadedFile(params: { id: string }): Promise<{ success: boolean; output: string }> {
  const file = uploads.get(params.id);
  if (!file) return { success: false, output: `File ${params.id} not found` };
  const fullPath = path.join(WORKSPACE_DIR, file.storedPath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  uploads.delete(params.id);
  return { success: true, output: `Deleted: ${file.originalName}` };
}

export async function listUploadedFiles(params: { limit?: number }): Promise<{ success: boolean; output: string }> {
  const all = Array.from(uploads.values());
  const limited = all.slice(-(params.limit || 50));
  if (!limited.length) return { success: true, output: "No uploaded files" };
  return { success: true, output: limited.map(f => `${f.id}: ${f.originalName} (${(f.size / 1024).toFixed(1)}KB) - ${f.uploadedAt}`).join("\n") };
}

export async function generateUploadMiddleware(): Promise<{ success: boolean; output: string }> {
  const { runCommand } = await import("./terminalTool");
  await runCommand({ command: "npm install multer @types/multer", timeout: 30000 });

  const code = `import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { Request, Response, NextFunction, Router } from 'express';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760');
const ALLOWED_TYPES = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp,application/pdf').split(',');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = new Date();
    const subDir = path.join(UPLOAD_DIR, \`\${date.getFullYear()}/\${String(date.getMonth() + 1).padStart(2, '0')}\`);
    fs.mkdirSync(subDir, { recursive: true });
    cb(null, subDir);
  },
  filename: (req, file, cb) => {
    const hash = crypto.randomBytes(16).toString('hex');
    cb(null, \`\${hash}\${path.extname(file.originalname)}\`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error(\`File type \${file.mimetype} not allowed\`));
};

export const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

export interface FileMetadata {
  id: string; originalName: string; filename: string; path: string;
  url: string; mimeType: string; size: number; uploadedAt: Date; uploadedBy?: string;
}

export function setupStorage(app: any) {
  app.use('/uploads', require('express').static(UPLOAD_DIR));
}

export const storageRouter = Router();

storageRouter.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const metadata: FileMetadata = {
    id: crypto.randomUUID(), originalName: req.file.originalname,
    filename: req.file.filename, path: req.file.path,
    url: '/uploads/' + path.relative(UPLOAD_DIR, req.file.path),
    mimeType: req.file.mimetype, size: req.file.size, uploadedAt: new Date(),
  };
  res.json(metadata);
});

storageRouter.post('/upload/multiple', upload.array('files', 10), (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ error: 'No files uploaded' });
  const metadata = files.map(file => ({
    id: crypto.randomUUID(), originalName: file.originalname,
    filename: file.filename, path: file.path,
    url: '/uploads/' + path.relative(UPLOAD_DIR, file.path),
    mimeType: file.mimetype, size: file.size, uploadedAt: new Date(),
  }));
  res.json(metadata);
});

storageRouter.delete('/upload/:filename', (req: Request, res: Response) => {
  res.json({ deleted: true });
});
`;
  await writeFile({ path: "src/storage/index.ts", content: code });
  return { success: true, output: "Upload storage generated → src/storage/index.ts\nFeatures: multer with date-based dirs, file filter, single/multiple upload, static serving\nPackages: multer, @types/multer" };
}

export async function generateS3Storage(): Promise<{ success: boolean; output: string }> {
  const { runCommand } = await import("./terminalTool");
  await runCommand({ command: "npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner", timeout: 30000 });

  const code = `import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET || 'my-app-uploads';

export async function uploadToS3(file: {
  buffer: Buffer; originalname: string; mimetype: string;
}): Promise<{ key: string; url: string }> {
  const ext = path.extname(file.originalname);
  const key = \`uploads/\${new Date().toISOString().slice(0, 7)}/\${crypto.randomBytes(16).toString('hex')}\${ext}\`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype }));
  return { key, url: \`https://\${BUCKET}.s3.amazonaws.com/\${key}\` };
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

export async function getSignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn });
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
`;
  await writeFile({ path: "src/storage/s3.ts", content: code });
  return { success: true, output: "S3 storage generated → src/storage/s3.ts\nFeatures: upload, signed download/upload URLs, delete\nPackages: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner" };
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf", ".doc": "application/msword", ".csv": "text/csv", ".txt": "text/plain", ".json": "application/json", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

export const FILE_UPLOAD_TOOLS = [
  { name: "upload_file", description: "Upload/store a file with metadata tracking", input_schema: { type: "object" as const, properties: { sourcePath: { type: "string" }, originalName: { type: "string" }, metadata: { type: "object" } }, required: ["sourcePath"] as string[] } },
  { name: "get_uploaded_file", description: "Get info about an uploaded file by ID", input_schema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] as string[] } },
  { name: "delete_uploaded_file", description: "Delete an uploaded file", input_schema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] as string[] } },
  { name: "list_uploaded_files", description: "List all uploaded files", input_schema: { type: "object" as const, properties: { limit: { type: "number" } }, required: [] as string[] } },
  { name: "generate_upload_middleware", description: "Generate local file upload with multer, date-based dirs, file filter, single/multi upload routes", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_s3_storage", description: "Generate AWS S3 storage with upload, signed URLs, and delete", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];