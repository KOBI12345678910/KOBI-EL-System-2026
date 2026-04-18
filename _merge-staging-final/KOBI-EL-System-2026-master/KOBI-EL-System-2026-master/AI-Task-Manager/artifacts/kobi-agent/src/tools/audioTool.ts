import { writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function setupAudioCapabilities(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n🎵 מגדיר יכולות אודיו...");

  await runCommand({ command: `mkdir -p ${WORKSPACE}/src/services ${WORKSPACE}/src/routes`, timeout: 5000 });

  const serviceCode = `import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(
  filePath: string,
  options?: { language?: string; prompt?: string }
): Promise<{ text: string; duration?: number; segments?: any[] }> {
  const file = fs.createReadStream(filePath);

  const transcription = await openai.audio.transcriptions.create({
    model: 'gpt-4o-transcribe',
    file,
    language: options?.language,
    prompt: options?.prompt,
    response_format: 'verbose_json',
  });

  return {
    text: transcription.text,
    duration: (transcription as any).duration,
    segments: (transcription as any).segments,
  };
}

export async function textToSpeech(
  text: string,
  outputPath: string,
  options?: {
    voice?: 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';
    speed?: number;
    format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
  }
): Promise<string> {
  const response = await openai.audio.speech.create({
    model: 'gpt-4o-audio',
    voice: options?.voice || 'nova',
    input: text,
    speed: options?.speed || 1.0,
    response_format: options?.format || 'mp3',
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

export async function voiceChat(
  audioFilePath: string,
  systemPrompt?: string
): Promise<{ text: string; audioResponse?: string }> {
  const transcription = await transcribeAudio(audioFilePath);

  const chatResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt || 'You are a helpful assistant. Respond concisely.' },
      { role: 'user', content: transcription.text },
    ],
  });

  const responseText = chatResponse.choices[0]?.message?.content || '';

  const audioPath = audioFilePath.replace(/\\.[^.]+$/, '-response.mp3');
  await textToSpeech(responseText, audioPath);

  return { text: responseText, audioResponse: audioPath };
}
`;

  const routeCode = `import { Router, Request, Response } from 'express';
import multer from 'multer';
import { transcribeAudio, textToSpeech, voiceChat } from '../services/audio';
import path from 'path';

const upload = multer({ dest: '/tmp/audio/' });
export const audioRouter = Router();

audioRouter.post('/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  try {
    const result = await transcribeAudio(req.file.path, {
      language: req.body.language,
      prompt: req.body.prompt,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

audioRouter.post('/tts', async (req: Request, res: Response) => {
  const { text, voice, speed, format } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  try {
    const outputPath = path.join('/tmp/audio', 'tts-' + Date.now() + '.' + (format || 'mp3'));
    await textToSpeech(text, outputPath, { voice, speed, format });
    res.sendFile(outputPath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

audioRouter.post('/voice-chat', upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  try {
    const result = await voiceChat(req.file.path, req.body.systemPrompt);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
`;

  await writeFile({ path: `${WORKSPACE}/src/services/audio.ts`, content: serviceCode });
  await writeFile({ path: `${WORKSPACE}/src/routes/audio.ts`, content: routeCode });

  return {
    success: true,
    output: `🎵 יכולות אודיו הוגדרו:\n  📄 src/services/audio.ts — transcribe, TTS, voice chat\n  📄 src/routes/audio.ts — Express routes\n  נדרש: npm install openai multer`,
  };
}

export async function generateTranscription(params: {
  audioPath: string;
  language?: string;
}): Promise<{ success: boolean; output: string }> {
  console.log("\n🎤 מתמלל אודיו...");

  const result = await runCommand({
    command: `curl -s -X POST http://localhost:${process.env.PORT || "8080"}/api/audio/transcribe -F "audio=@${params.audioPath}"${params.language ? ` -F "language=${params.language}"` : ""}`,
    timeout: 60000,
  });

  if (result.stderr && !result.stdout) return { success: false, output: `שגיאה בתמלול: ${result.stderr}` };
  return { success: true, output: `🎤 תמלול:\n${result.stdout}` };
}

export async function generateSpeech(params: {
  text: string;
  voice?: string;
  format?: string;
}): Promise<{ success: boolean; output: string }> {
  console.log("\n🔊 מייצר דיבור...");

  const body = JSON.stringify({
    text: params.text,
    voice: params.voice || "nova",
    format: params.format || "mp3",
  });

  const result = await runCommand({
    command: `curl -s -X POST http://localhost:${process.env.PORT || "8080"}/api/audio/tts -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}'  -o /tmp/audio/speech-${Date.now()}.mp3 -w "%{http_code}"`,
    timeout: 30000,
  });

  return {
    success: result.stdout.includes("200"),
    output: result.stdout.includes("200") ? "🔊 קובץ אודיו נוצר בהצלחה" : `שגיאה: ${result.stdout} ${result.stderr}`,
  };
}

export const AUDIO_TOOLS = [
  {
    name: "setup_audio_capabilities",
    description: "הגדרת יכולות אודיו — תמלול, text-to-speech, voice chat עם OpenAI",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "generate_transcription",
    description: "תמלול קובץ אודיו — speech-to-text",
    input_schema: {
      type: "object" as const,
      properties: {
        audioPath: { type: "string", description: "נתיב לקובץ אודיו" },
        language: { type: "string", description: "שפה (he, en, ar...)" },
      },
      required: ["audioPath"] as string[],
    },
  },
  {
    name: "generate_speech",
    description: "יצירת דיבור מטקסט — text-to-speech עם בחירת קול",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "הטקסט להמרה" },
        voice: { type: "string", description: "קול: alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer" },
        format: { type: "string", description: "פורמט: mp3, opus, aac, flac, wav" },
      },
      required: ["text"] as string[],
    },
  },
];
