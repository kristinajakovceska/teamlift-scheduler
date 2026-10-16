import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

interface BookingDetails {
  name: string;
  topic: string | null;
  startsAt: string; // "YYYY-MM-DDTHH:MM"
  durationMinutes: number;
}

/**
 * Calls Google Gemini (free tier via Google AI Studio) over its REST API — no SDK needed.
 * If no key is configured or the call fails, it falls back to a template so booking
 * never breaks because of the AI feature.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async bookingConfirmation(booking: BookingDetails): Promise<{ message: string; source: 'ai' | 'template' }> {
    if (!config.geminiApiKey) return { message: templateMessage(booking), source: 'template' };

    try {
      const message = await this.generate(buildPrompt(booking));
      return { message, source: 'ai' };
    } catch (err) {
      this.logger.warn(`Gemini call failed, using template: ${(err as Error).message}`);
      return { message: templateMessage(booking), source: 'template' };
    }
  }

  private async generate(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Generous token cap: on Gemini 3 models any internal "thinking" counts toward it.
        generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!text) throw new Error('Empty response');
    return text;
  }
}

function buildPrompt(b: BookingDetails): string {
  return [
    `You are the friendly scheduling assistant for ${config.hostName}, a coach at TeamLift who helps`,
    `people inside companies become "AI champions" for their teams.`,
    `Write a short, warm confirmation message (2-3 sentences, under 70 words) to ${b.name},`,
    `who just booked a ${b.durationMinutes}-minute office-hours session on ${humanDate(b.startsAt)}`,
    `(${config.timezone} time).`,
    b.topic
      ? `They want to talk about: "${b.topic}". Reference it naturally and suggest one small thing they could bring or think about beforehand.`
      : `They didn't share a topic, so gently invite them to think about one AI use case from their week.`,
    `Plain text only, no markdown, no subject line, no sign-off placeholders like [Name].`,
  ].join(' ');
}

function templateMessage(b: BookingDetails): string {
  const topic = b.topic ? ` We'll dig into "${b.topic}", so bring any examples you have.` : '';
  return `You're all set, ${b.name}! Your ${b.durationMinutes}-minute session with ${config.hostName} is booked for ${humanDate(b.startsAt)}.${topic} See you there!`;
}

function humanDate(startsAt: string): string {
  const [date, time] = startsAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return `${day} at ${time}`;
}
