import Anthropic from '@anthropic-ai/sdk';
import { RULES, STORY_BRIEF, OUTPUT_SCHEMA, personaFor, personaBlock, contextBlock, historyMessages, cleanReply, str } from '../src/ai/prompt.js';

// The AI characters' brain: one Vercel serverless function. The browser sends who it's talking to,
// a few facts about the moment and the conversation; this builds the prompt, asks Claude for a reply
// in a fixed JSON shape, and returns it. The API key never leaves the server.
//
// Environment (Vercel project settings):
//   ANTHROPIC_API_KEY   required; without it the game uses its built-in offline replies
//   AGENT_MODEL         optional, default claude-opus-5-5 (claude-haiku-5-5 is ~40x cheaper)
//   AGENT_DAILY_LIMIT   optional, replies per server instance per day (default 3000)
//   AGENT_ORIGINS       optional, comma-separated host suffixes allowed to call this

const MODEL = process.env.AGENT_MODEL || 'claude-opus-5-5';
const DAILY = +process.env.AGENT_DAILY_LIMIT || 3000;
const ORIGINS = (process.env.AGENT_ORIGINS || 'paraspipre.com,vercel.app,localhost,127.0.0.1').split(',').map((s) => s.trim()).filter(Boolean);

let client = null;
const getClient = () => client || (client = new Anthropic({ fetch: globalThis.__agentFetch, maxRetries: 1, timeout: 25000 }));

// Simple per-instance limits so a public page can't run up the bill: per visitor per minute and per day,
// and per instance per day.
const seen = new Map();
let day = '', dayCount = 0;
function limited(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; seen.clear(); }
  if (dayCount >= DAILY) return 'daily';
  const now = Date.now();
  const s = seen.get(ip) || { min: [], n: 0 };
  s.min = s.min.filter((t) => now - t < 60000);
  if (s.min.length >= 12) return 'minute';
  if (s.n >= 200) return 'visitor';
  s.min.push(now); s.n++; dayCount++;
  seen.set(ip, s);
  return null;
}

function allowedOrigin(req) {
  const h = req.headers || {};
  const o = h.origin || h.referer || '';
  if (!o) return true;   // same-origin fetches from some browsers omit it
  try { const host = new URL(o).hostname; return ORIGINS.some((s) => host === s || host.endsWith('.' + s) || host.endsWith(s)); } catch { return false; }
}

const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); };

export default async function handler(req, res) {
  const ready = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || globalThis.__agentFetch);
  if (req.method === 'GET') return send(res, 200, { ai: ready, model: ready ? MODEL : null });
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!ready) return send(res, 503, { error: 'no_key' });
  if (!allowedOrigin(req)) return send(res, 403, { error: 'origin' });
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'anon').trim();
  const lim = limited(ip);
  if (lim) return send(res, 429, { error: 'busy', why: lim });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'body' });
  const persona = personaFor(body);
  const message = str(body.message, 400);
  if (!persona || !message) return send(res, 400, { error: 'input' });
  const isSignal = persona.id === 'signal';

  const messages = historyMessages(body.history);
  const turn = `[Context]\n${contextBlock(body.context || {})}\n\n[The player says]\n${message}`;
  if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content += '\n\n' + turn;
  else messages.push({ role: 'user', content: turn });

  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 2000,   // replies are a few sentences; this caps cost (thinking at low effort included)
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: `${RULES}\n\n${STORY_BRIEF}`, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: personaBlock(persona) },
      ],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages,
    });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return send(res, 200, { offline: true, why: response.stop_reason });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let parsed;
    try { parsed = JSON.parse(text); } catch { return send(res, 200, { offline: true, why: 'parse' }); }
    const reply = cleanReply(parsed, isSignal);
    if (isSignal) {
      // never jump more than 25 points in one message
      const before = Math.max(0, Math.min(100, (body.context?.signal?.convinced | 0)));
      reply.convinced = Math.max(0, Math.min(100, before + Math.max(-25, Math.min(25, reply.convinced - before))));
    }
    return send(res, 200, { reply });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'busy', why: 'upstream' });
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return send(res, 503, { error: 'no_key' });
    if (err instanceof Anthropic.BadRequestError) { console.error('agent 400', err.message); return send(res, 502, { error: 'bad_request' }); }
    if (err instanceof Anthropic.APIError) { console.error('agent api', err.status, err.message); return send(res, 502, { error: 'upstream' }); }
    console.error('agent', err);
    return send(res, 500, { error: 'server' });
  }
}
