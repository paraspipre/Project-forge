// A tiny MQTT 3.1.1 client over WebSocket (QoS 0 only), enough for game presence and
// state sync through a public broker. No dependencies; works in browsers and Node 22+.

const enc = new TextEncoder();
const dec = new TextDecoder();

function str(s) {
  const b = enc.encode(s);
  const out = new Uint8Array(2 + b.length);
  out[0] = b.length >> 8; out[1] = b.length & 255; out.set(b, 2);
  return out;
}

function varLen(n) {
  const out = [];
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0);
  return out;
}

function packet(type, parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const head = [type, ...varLen(len)];
  const out = new Uint8Array(head.length + len);
  out.set(head, 0);
  let o = head.length;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const u16 = (n) => new Uint8Array([n >> 8, n & 255]);
const toBytes = (p) => (p instanceof Uint8Array ? p : typeof p === 'string' ? enc.encode(p) : new Uint8Array(p));

export class MiniMqtt {
  // url: wss://host:port/mqtt. opts: { clientId, keepalive, will: { topic, payload, retain } }
  constructor(url, opts = {}) {
    this.url = url;
    this.clientId = opts.clientId || 'c' + Math.random().toString(36).slice(2, 12);
    this.keepalive = opts.keepalive || 30;
    this.will = opts.will || null;
    this.handlers = new Set();
    this.subs = new Set();
    this.pid = 1;
    this.connected = false;
    this.onclose = null;
    this.buf = new Uint8Array(0);
  }

  connect(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (e) => { if (!done) { done = true; reject(e); } try { ws.close(); } catch {} };
      const timer = setTimeout(() => fail(new Error('connect timeout')), timeoutMs);
      const ws = new WebSocket(this.url, ['mqtt']);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => {
        let flags = 0x02; // clean session
        const payload = [str(this.clientId)];
        if (this.will) {
          flags |= 0x04 | (this.will.retain ? 0x20 : 0);
          const wp = toBytes(this.will.payload || '');
          payload.push(str(this.will.topic), u16(wp.length), wp);
        }
        ws.send(packet(0x10, [str('MQTT'), new Uint8Array([4, flags]), u16(this.keepalive), ...payload]));
      };
      ws.onmessage = (ev) => {
        this._feed(new Uint8Array(ev.data), (type, body) => {
          if (type === 2 && !done) {
            clearTimeout(timer);
            if (body[1] !== 0) return fail(new Error('connack refused ' + body[1]));
            done = true;
            this.connected = true;
            this._ping = setInterval(() => this._send(new Uint8Array([0xc0, 0])), this.keepalive * 500);
            resolve(this);
          }
        });
      };
      ws.onerror = () => fail(new Error('socket error'));
      ws.onclose = () => {
        clearTimeout(timer);
        const was = this.connected;
        this.connected = false;
        clearInterval(this._ping);
        if (!done) fail(new Error('closed before connack'));
        else if (was && this.onclose) this.onclose();
      };
    });
  }

  _send(bytes) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(bytes);
  }

  // Splits the byte stream into MQTT packets (a WebSocket frame may hold several, or a part of one).
  _feed(chunk, onPacket) {
    const b = new Uint8Array(this.buf.length + chunk.length);
    b.set(this.buf); b.set(chunk, this.buf.length);
    let o = 0;
    while (o + 2 <= b.length) {
      let mult = 1, len = 0, i = o + 1, byte;
      do {
        if (i >= b.length) { this.buf = b.slice(o); return; }
        byte = b[i++]; len += (byte & 127) * mult; mult *= 128;
      } while (byte & 128);
      if (i + len > b.length) break;
      const type = b[o] >> 4, flags = b[o] & 15, body = b.subarray(i, i + len);
      if (type === 3) this._onPublish(flags, body);
      else onPacket?.(type, body);
      o = i + len;
    }
    this.buf = b.slice(o);
  }

  _onPublish(flags, body) {
    const tl = (body[0] << 8) | body[1];
    const topic = dec.decode(body.subarray(2, 2 + tl));
    let o = 2 + tl;
    if ((flags >> 1) & 3) o += 2; // packet id for QoS > 0 (we never ask for it)
    const payload = body.slice(o);
    const retained = !!(flags & 1);
    for (const h of this.handlers) h(topic, payload, retained);
  }

  onMessage(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }

  subscribe(filter) {
    this.subs.add(filter);
    const id = this.pid = (this.pid % 65535) + 1;
    this._send(packet(0x82, [u16(id), str(filter), new Uint8Array([0])]));
  }

  unsubscribe(filter) {
    this.subs.delete(filter);
    const id = this.pid = (this.pid % 65535) + 1;
    this._send(packet(0xa2, [u16(id), str(filter)]));
  }

  publish(topic, payload, retain = false) {
    this._send(packet(0x30 | (retain ? 1 : 0), [str(topic), toBytes(payload)]));
  }

  close() {
    this._send(new Uint8Array([0xe0, 0]));
    clearInterval(this._ping);
    this.connected = false;
    try { this.ws.close(); } catch {}
  }

  static decode(bytes) { return dec.decode(bytes); }
}
