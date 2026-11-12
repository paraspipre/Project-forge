// Local server for testing: serves the game like Vercel does (static files + /api/agent).
//   npm run dev                       (uses ANTHROPIC_API_KEY if set, else the game's offline replies)
//   AGENT_MOCK=1 npm run dev          (fake Claude replies, to test the plumbing without a key)
//   PORT=8770 npm run dev
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8770;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

if (process.env.AGENT_MOCK) {
  // Stand-in for api.anthropic.com: records the request and answers in the Messages API shape.
  process.env.ANTHROPIC_API_KEY = 'sk-mock-not-a-real-key';
  globalThis.__agentLog = [];
  globalThis.__agentFetch = async (url, init) => {
    const req = JSON.parse(init.body);
    globalThis.__agentLog.push(req);
    const last = req.messages[req.messages.length - 1].content;
    const said = String(last).split('[The player says]\n').pop();
    const signal = /SIGNAL \(Smart/.test(req.system[1].text);
    const before = +((/convinced level so far: (\d+)/.exec(last) || [])[1] || 0);
    const reply = {
      say: signal ? `CHINNI? ...Nobody has called me that in fifty years. (heard: ${said.slice(0, 40)})` : `Mock reply to "${said.slice(0, 50)}". Swalpa adjust maadi, guru!`,
      kn: 'ಸ್ವಲ್ಪ ಅಡ್ಜಸ್ಟ್ ಮಾಡಿ', emote: 'wobble', replies: ['Tell me more', 'Where should I go?', 'Bye!'],
      action: /favour|help you/i.test(said) ? { type: 'favour', place: '', reward: 25 } : /where/i.test(said) ? { type: 'waypoint', place: 'Cubbon Park', reward: 0 } : { type: 'none', place: '', reward: 0 },
      remember: /my name|i am|i'm/i.test(said) ? `Player said: ${said.slice(0, 60)}` : '',
      convinced: signal ? Math.min(100, before + (/chinni|vasudha|people|adjust|see you|thank/i.test(said) ? 25 : 5)) : 0,
    };
    const body = { id: 'msg_mock', type: 'message', role: 'assistant', model: req.model, stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: JSON.stringify(reply) }],
      usage: { input_tokens: 900, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
    await new Promise((r) => setTimeout(r, 300));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_mock' } });
  };
}

const { default: agent } = await import('../api/agent.js');

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/agent') {
    let data = '';
    for await (const c of req) data += c;
    req.body = data;
    return agent(req, res);
  }
  if (url.pathname === '/__agentlog') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(globalThis.__agentLog || [])); }
  let p = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try {
    if (fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    res.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  } catch { res.statusCode = 404; res.end('not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`Peak Bengaluru dev server: http://127.0.0.1:${PORT}/  (AI: ${process.env.AGENT_MOCK ? 'mock' : process.env.ANTHROPIC_API_KEY ? 'live' : 'offline'})`));
