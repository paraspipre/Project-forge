import * as THREE from 'three';
import { Kit, rectRing } from '../world/landmarks/kit.js';
import { findOpenSpot } from './Venue.js';
import { ScreenShare } from '../net/ScreenShare.js';
import { clean, listMeetups, postMeetup, makeId } from '../net/Net.js';
import { ZONES } from '../data/zones.js';

// Namma Meetup Hall: an open-air hall with a stage, a big screen, benches and project booths.
//  - Walk onto the stage to present: share your screen (shown live on the big screen for everyone
//    in the hall), or slides (image links) and a project link. Your voice goes through the PA, so
//    the whole hall hears you clearly.
//  - The audience reacts (👏🔥😂💡❤️), raises hands, and the presenter can give someone the floor.
//  - Six booths: put up your project (name, one-liner, link, picture) for people to walk up to.
//  - The meetup calendar: schedule a talk / demo day / hangout; everyone sees it from any district.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const REACTS = ['👏', '🔥', '😂', '💡', '❤️'];
const W = 16, D = 15;                    // half size of the hall
const BOOTH_Z = [-6, 0, 6];
const DAY = 86400000;

export function safeUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    if (x.protocol !== 'https:') return null;
    return x.href.slice(0, 400);
  } catch { return null; }
}
const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function fmtWhen(at) {
  const d = new Date(at), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = d.toDateString() === now.toDateString() ? 'Today'
    : new Date(now.getTime() + DAY).toDateString() === d.toDateString() ? 'Tomorrow'
      : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

export class Hall {
  constructor(social, city, zone, venuePos) {
    this.s = social;
    this.g = social.game;
    this.zone = zone;
    const hint = [venuePos.x + 70, venuePos.z + 15];
    let seed = 11; for (const c of zone) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
    const [cx, cz] = findOpenSpot(city, hint, 22, 650, seed, (x, z) => Math.hypot(x - venuePos.x, z - venuePos.z) > 52);
    this.pos = new THREE.Vector3(cx, 0, cz);
    let yaw = 0, bd = Infinity;
    for (const rd of city.roads) {
      if (rd.code > 7 || rd.bridge) continue;
      for (const p of rd.pts) { const d = (p[0] - cx) ** 2 + (p[1] - cz) ** 2; if (d < bd) { bd = d; yaw = Math.atan2(p[0] - cx, p[1] - cz); } }
    }
    this.yaw = yaw;
    this.c = Math.cos(yaw); this.sn = Math.sin(yaw);
    const kit = new Kit(city, cx, cz, yaw);
    this.kit = kit;
    // floor, stage, steps
    kit.box(0, 0, 0, W * 2, 0.15, D * 2, '#e8dcc4');
    kit.box(0, 0.15, -9.5, 13, 0.75, 5, '#8a5a34');
    kit.box(0, 0.9, -9.5, 13.2, 0.05, 5.2, '#a8714c');
    for (const sx of [-1, 1]) kit.box(sx * 5.4, 0.15, -6.55, 1.8, 0.35, 0.9, '#8a5a34');
    // the big screen and its frame, speakers, podium
    kit.box(0, 0.9, -12.35, 11.4, 6.7, 0.35, '#2b2b30');
    for (const sx of [-1, 1]) {
      kit.box(sx * 6.4, 0.9, -11.3, 1.1, 2.0, 1.0, '#1d1d22');
      kit.box(sx * 6.4, 2.9, -11.3, 0.9, 1.0, 0.8, '#1d1d22');
    }
    kit.box(3.6, 0.9, -8.4, 0.9, 1.15, 0.6, '#6b4a35');
    kit.box(3.6, 2.05, -8.4, 1.0, 0.06, 0.75, '#4a3428');
    // benches
    this.benches = [];
    for (const z of [-3, 0, 3, 6, 9]) for (const sx of [-1, 1]) {
      kit.box(sx * 4.3, 0.15, z, 6.4, 0.42, 0.6, '#b07a4a');
      kit.box(sx * 4.3, 0.57, z + 0.3, 6.4, 0.5, 0.08, '#9a6a40');
      this.benches.push({ x: sx * 4.3, z });
    }
    // booths along both sides
    const boothCols = ['#f07b5a', '#3fb3a6', '#f2c14e', '#8e5bb5', '#5aa9e6', '#e75a7c'];
    this.boothDefs = [];
    for (const sx of [-1, 1]) BOOTH_Z.forEach((z, i) => {
      const n = (sx < 0 ? 0 : 3) + i, col = boothCols[n];
      kit.box(sx * 13.0, 0.15, z, 1.0, 1.0, 3.0, col);
      kit.box(sx * 13.0, 1.15, z, 1.15, 0.06, 3.15, '#f4f1ea');
      kit.box(sx * 14.6, 0.15, z, 0.2, 3.6, 3.6, '#f4f1ea');
      kit.box(sx * 13.8, 3.75, z, 2.2, 0.1, 3.8, col);
      for (const zz of [-1.75, 1.75]) kit.box(sx * 12.75, 0.15, z + zz, 0.1, 3.6, 0.1, '#c9c2b6');
      this.boothDefs.push({ n, sx, z, stand: kit.w(sx * 11.4, z) });
    });
    // posts, beams and fairy lights all around (no roof, so the camera never ends up above one)
    for (const [x, z] of [[-W, -D], [W, -D], [-W, D], [W, D], [-W, 0], [W, 0]]) kit.box(x, 0.15, z, 0.4, 6.5, 0.4, '#c9c2b6');
    kit.box(-W, 6.6, 0, 0.3, 0.3, D * 2, '#c9c2b6'); kit.box(W, 6.6, 0, 0.3, 0.3, D * 2, '#c9c2b6');
    kit.box(0, 6.6, -D, W * 2, 0.3, 0.3, '#c9c2b6'); kit.box(0, 6.6, D, W * 2, 0.3, 0.3, '#c9c2b6');
    const fair = ['#f2c14e', '#e75a7c', '#8ff0ff', '#7dc47c', '#ffffff'];
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const sag = Math.sin(t * Math.PI) * 0.9;
      kit.cyl(-W + t * W * 2, 6.3 - sag, -D, 0.1, 0.1, 0.18, fair[i % 5], 6, 100);
      kit.cyl(-W + t * W * 2, 6.3 - sag, D, 0.1, 0.1, 0.18, fair[(i + 2) % 5], 6, 100);
      kit.cyl(-W + t * W * 2, 6.6 - sag * 1.6, 0, 0.1, 0.1, 0.18, fair[(i + 1) % 5], 6, 100);
    }
    // a shamiana-style striped valance along the front and back beams
    for (let i = 0; i < 16; i++) for (const z of [-D, D]) kit.box(-W + 1 + i * 2, 5.9, z, 2.0, 0.7, 0.08, i % 2 ? '#e75a7c' : '#fff6e6');
    // entrance arch and the calendar board
    for (const sx of [-1, 1]) kit.box(sx * 4.2, 0.15, D + 0.6, 0.6, 5.2, 0.6, '#c9c2b6');
    kit.box(0, 5.35, D + 0.6, 9.2, 0.4, 0.6, '#c9c2b6');
    kit.box(7.5, 0.15, D - 1.6, 0.2, 2.4, 0.2, '#6b4a35');
    kit.box(9.9, 0.15, D - 1.6, 0.2, 2.4, 0.2, '#6b4a35');
    kit.box(8.7, 1.2, D - 1.6, 2.8, 1.5, 0.15, '#8a5a34');
    this.object = new THREE.Group();
    this.object.add(kit.mesh());
    // walkable / solid bits
    city.addPlatform(rectRing(cx, cz, W * 2, D * 2, yaw), 0.15);
    const st = kit.w(0, -9.5);
    city.addPlatform(rectRing(st[0], st[1], 13, 5, yaw), 0.9);
    for (const sx of [-1, 1]) { const p = kit.w(sx * 5.4, -6.55); city.addPlatform(rectRing(p[0], p[1], 1.8, 0.9, yaw), 0.5); }
    for (const b of this.benches) { const p = kit.w(b.x, b.z); city.addPlatform(rectRing(p[0], p[1], 6.4, 0.6, yaw), 0.57); }
    const sc = kit.w(0, -12.35);
    city.addSolid(rectRing(sc[0], sc[1], 11.4, 0.35, yaw), 7.6, 0, 'Screen');
    for (const sx of [-1, 1]) { const p = kit.w(sx * 6.4, -11.3); city.addSolid(rectRing(p[0], p[1], 1.1, 1.0, yaw), 3.9, 0, 'Speaker'); }
    const pd = kit.w(3.6, -8.4);
    city.addSolid(rectRing(pd[0], pd[1], 0.9, 0.6, yaw), 2.1, 0, 'Podium');
    for (const b of this.boothDefs) {
      const p = kit.w(b.sx * 13.0, b.z); city.addSolid(rectRing(p[0], p[1], 1.0, 3.0, yaw), 1.2, 0, 'Booth');
      const q = kit.w(b.sx * 14.6, b.z); city.addSolid(rectRing(q[0], q[1], 0.2, 3.6, yaw), 3.8, 0, 'Booth');
    }
    // the big screen: a canvas (idle / slides / talk title) or the live screen share
    this.cv = document.createElement('canvas'); this.cv.width = 1024; this.cv.height = 576;
    this.cvTex = new THREE.CanvasTexture(this.cv);
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.cvTex, toneMapped: false });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 5.96), this.screenMat);
    const sp = kit.w(0, -12.15);
    this.screen.position.set(sp[0], 0.9 + 0.35 + 2.98, sp[1]);
    this.screen.rotation.y = yaw;
    this.object.add(this.screen);
    // booth boards
    this.booths = this.boothDefs.map((b) => {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320;
      const tex = new THREE.CanvasTexture(cv);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      const p = kit.w(b.sx * 14.48, b.z);
      m.position.set(p[0], 2.35, p[1]);
      m.rotation.y = yaw + (b.sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      this.object.add(m);
      const bo = { ...b, cv, tex, data: null };
      this._drawBooth(bo);
      return bo;
    });
    this.signs = [
      { text: 'NAMMA MEETUP HALL', sub: 'Talks · Demos · Hangouts · ಮಾತು-ಕತೆ', pos: kit.w(0, D + 0.95), y: 5.55, yaw, w: 8.6, h: 1.5, bg: '#1f4e8c', fg: '#ffffff' },
      { text: 'MEETUP CALENDAR', sub: 'Host a talk · see what\'s on', pos: kit.w(8.7, D - 1.5), y: 1.95, yaw, w: 2.6, h: 1.2, bg: '#f4f1ea', fg: '#8a2b1e' },
    ];
    this.spots = { stage: kit.w(0, -9.5), podium: kit.w(3.6, -7.7), board: kit.w(8.7, D - 2.6), entrance: kit.w(0, D + 3) };
    // presenting state
    this.share = new ScreenShare(this.g);
    this.share.onVideo = (v) => this._setVideo(v);
    this.stage = null;            // { id, name, title, link, slides, i, screen, since, t }
    this.presenting = false;
    this.hands = new Map();       // presenter: id -> name
    this.handUp = false;
    this.floor = null;            // who the presenter gave the floor to
    this.meetups = [];
    this.reactT = 0;
    this._idleDraw();
    this.refreshMeetups();
    this.bar = document.createElement('div');
    this.bar.id = 'hallbar'; this.bar.className = 'hidden';
    $('hud').appendChild(this.bar);
    this.bar.addEventListener('click', (e) => this._barClick(e));
  }

  dispose() {
    if (this.presenting) this.stopPresenting();
    this.share.stop(); this.share.dropIncoming();
    this.bar.remove();
    this.g.voice.onStage = false;
    this.videoTex?.dispose();
  }

  // ------------------------------------------------------------------ geometry helpers

  local(p) { const dx = p.x - this.pos.x, dz = p.z - this.pos.z; return [dx * this.c - dz * this.sn, dx * this.sn + dz * this.c]; }
  inside(p) { const [x, z] = this.local(p); return Math.abs(x) < W + 0.5 && Math.abs(z) < D + 1.5; }
  onStage(p) { const [x, z] = this.local(p); return Math.abs(x) < 6.6 && z < -6.9 && z > -12 && (p.y || 0) > 0.6; }

  // ------------------------------------------------------------------ the big screen

  _idleDraw() {
    const c = this.cv.getContext('2d'), w = this.cv.width, h = this.cv.height;
    c.fillStyle = '#1f2a44'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2c14e'; c.font = '64px Bangers, sans-serif'; c.textAlign = 'center';
    c.fillText('NAMMA MEETUP HALL', w / 2, 92);
    c.fillStyle = '#fff6e6'; c.font = '600 30px "Baloo 2", sans-serif';
    c.fillText('Walk up on stage to present your work.', w / 2, 150);
    c.fillText('Share your screen, slides or a link. Everyone here sees it.', w / 2, 190);
    const up = this.meetups.filter((m) => m.zone === this.zone).slice(0, 3);
    c.textAlign = 'left';
    c.fillStyle = '#8ff0ff'; c.font = '700 30px "Baloo 2", sans-serif';
    c.fillText(up.length ? 'COMING UP HERE' : 'NO MEETUPS SCHEDULED YET', 80, 270);
    c.font = '600 28px "Baloo 2", sans-serif';
    if (!up.length) { c.fillStyle = '#fff6e6'; c.fillText('Host one from the Meetup Calendar board at the entrance!', 80, 320); }
    up.forEach((m, i) => {
      const live = m.at <= Date.now();
      c.fillStyle = live ? '#ff7ad9' : '#fff6e6';
      c.fillText(`${live ? '● LIVE  ' : fmtWhen(m.at) + '  ·  '}${m.title}`.slice(0, 62), 80, 322 + i * 50);
      c.fillStyle = '#c9c2b6'; c.font = '500 22px "Baloo 2", sans-serif';
      c.fillText(`by ${m.hostName}`, 80, 346 + i * 50);
      c.font = '600 28px "Baloo 2", sans-serif';
    });
    c.fillStyle = '#c9c2b6'; c.font = '500 22px "Baloo 2", sans-serif'; c.textAlign = 'center';
    c.fillText('Turn your mic on with V · react with the buttons at the bottom', w / 2, h - 30);
    this.screenMat.map = this.cvTex;
    this.cvTex.needsUpdate = true;
    this.screenMat.needsUpdate = true;
  }

  _talkDraw(st, note = '') {
    const c = this.cv.getContext('2d'), w = this.cv.width, h = this.cv.height;
    c.fillStyle = '#2b2236'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff7ad9'; c.font = '700 28px "Baloo 2", sans-serif'; c.textAlign = 'center';
    c.fillText('● LIVE ON STAGE', w / 2, 70);
    c.fillStyle = '#fff6e6'; c.font = '56px Bangers, sans-serif';
    const words = (st.title || 'Untitled talk').split(' ');
    const lines = []; let line = '';
    for (const wd of words) { if ((line + ' ' + wd).length > 30) { lines.push(line); line = wd; } else line = (line ? line + ' ' : '') + wd; }
    lines.push(line);
    lines.slice(0, 3).forEach((l, i) => c.fillText(l, w / 2, 170 + i * 66));
    c.fillStyle = '#f2c14e'; c.font = '700 32px "Baloo 2", sans-serif';
    c.fillText(`by ${st.name}`, w / 2, 400);
    if (st.link) { c.fillStyle = '#8ff0ff'; c.font = '600 28px "Baloo 2", sans-serif'; c.fillText(`🔗 ${domain(st.link)}`, w / 2, 455); }
    if (note) { c.fillStyle = '#c9c2b6'; c.font = '500 24px "Baloo 2", sans-serif'; c.fillText(note, w / 2, h - 36); }
    this.screenMat.map = this.cvTex;
    this.cvTex.needsUpdate = true;
    this.screenMat.needsUpdate = true;
  }

  _setVideo(v) {
    this.videoTex?.dispose();
    this.videoTex = null;
    if (v) {
      this.videoTex = new THREE.VideoTexture(v);
      this.screenMat.map = this.videoTex;
      this.screenMat.needsUpdate = true;
      if ($('fullview') && !$('fullview').classList.contains('hidden')) this.openFull();
    } else this._refreshScreen();
  }

  _refreshScreen() {
    const st = this.stage;
    if (!st) { this._idleDraw(); return; }
    if (st.screen && this.share.video) { this._setVideo(this.share.video); return; }
    const slide = st.slides?.[st.i || 0];
    if (slide) {
      const key = slide;
      if (this._slideKey === key && this._slideTex) { this.screenMat.map = this._slideTex; this.screenMat.needsUpdate = true; return; }
      this._slideKey = key;
      this._talkDraw(st, 'Loading slide…');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        if (this._slideKey !== key) return;
        this._slideTex?.dispose();
        this._slideTex = new THREE.Texture(img);
        this._slideTex.needsUpdate = true;
        this.screenMat.map = this._slideTex; this.screenMat.needsUpdate = true;
      };
      img.onerror = () => { if (this._slideKey === key) this._talkDraw(st, `Slide ${(st.i || 0) + 1}: tap ⛶ Full view to see it`); };
      img.src = slide;
      return;
    }
    this._talkDraw(st, st.screen ? 'Connecting to the screen share…' : '');
  }

  // ------------------------------------------------------------------ booths

  _drawBooth(b) {
    const c = b.cv.getContext('2d'), w = b.cv.width, h = b.cv.height, d = b.data;
    c.fillStyle = d ? '#fff6e6' : '#efe3cb'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#2a2226'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
    c.textAlign = 'center'; c.fillStyle = '#2a2226';
    if (!d) {
      c.font = '44px Bangers, sans-serif'; c.fillText('FREE BOOTH', w / 2, 110);
      c.font = '600 26px "Baloo 2", sans-serif'; c.fillText('Show your project here!', w / 2, 170);
      c.fillText('Walk up and press E / ✋', w / 2, 215);
    } else {
      c.font = '46px Bangers, sans-serif';
      const t = d.title.length > 22 ? d.title.slice(0, 21) + '…' : d.title;
      c.fillText(t, w / 2, 90);
      c.font = '600 24px "Baloo 2", sans-serif';
      const words = (d.line || '').split(' '); let line = '', y = 140;
      for (const wd of words) { if ((line + ' ' + wd).length > 34) { c.fillText(line, w / 2, y); y += 30; line = wd; if (y > 200) break; } else line = (line ? line + ' ' : '') + wd; }
      if (y <= 200) c.fillText(line, w / 2, y);
      c.fillStyle = '#8e5bb5'; c.font = '700 24px "Baloo 2", sans-serif';
      c.fillText(`by ${d.name}${d.link ? '  ·  🔗 ' + domain(d.link) : ''}`.slice(0, 44), w / 2, 280);
    }
    b.tex.needsUpdate = true;
  }

  onBooth(n, m) {
    const b = this.booths[n];
    if (!b) return;
    let d = null;
    if (m && typeof m === 'object' && Date.now() - (+m.t || 0) < DAY) {
      d = { owner: String(m.owner || '').slice(0, 8), name: clean(m.name || 'Someone').slice(0, 16), title: clean(m.title || '').slice(0, 40), line: clean(m.line || '').slice(0, 110), link: safeUrl(m.link), img: safeUrl(m.img), t: +m.t };
      if (!d.title) d = null;
    }
    if (d && this._hidden().has(`${d.owner}:${d.title}`)) d = { ...d, title: '(hidden)', line: 'You hid this booth.', link: null, img: null };
    b.data = d;
    this._drawBooth(b);
  }

  _hidden() { try { return new Set(JSON.parse(localStorage.getItem('pb.hiddenBooths') || '[]')); } catch { return new Set(); } }

  myBooth() { return this.booths.find((b) => b.data && b.data.owner === this.g.profile.id); }

  openBooth(b) {
    const g = this.g, d = b.data, mine = d && d.owner === g.profile.id;
    const el = this._screen('boothview');
    if (!d || mine) {
      const cur = d || {};
      el.innerHTML = `<div class="menu-card wide"><h2>${d ? 'Your booth' : 'Set up your booth'}</h2>
        <div class="credits">Show what you're building. It stays up for 24 hours for everyone in ${esc(ZONES[this.zone]?.short || this.zone)}${g.profile.room !== 'public' ? ' (your private room)' : ''}.</div>
        <div class="form">
          <label>Project name<input id="bo-title" maxlength="40" value="${esc(cur.title || '')}" placeholder="e.g. Dosa Delivery Drone"></label>
          <label>One-liner<input id="bo-line" maxlength="110" value="${esc(cur.line || '')}" placeholder="What it does, in one line"></label>
          <label>Link (https)<input id="bo-link" maxlength="300" value="${esc(cur.link || '')}" placeholder="https://github.com/you/project"></label>
          <label>Picture link (optional, https)<input id="bo-img" maxlength="300" value="${esc(cur.img || '')}" placeholder="https://…/screenshot.png"></label>
        </div>
        <div class="menu-buttons"><button class="menu-btn primary" data-a="save">${d ? 'Update booth' : 'Put it up!'}</button>${d ? '<button class="menu-btn" data-a="clear">Take it down</button>' : ''}<button class="menu-btn" data-a="close">Cancel</button></div></div>`;
    } else {
      const online = g.remotes.has(d.owner);
      el.innerHTML = `<div class="menu-card wide booth-card"><div class="pg-kicker">BOOTH ${b.n + 1} · MEETUP HALL</div><h2>${esc(d.title)}</h2>
        <p class="booth-line">${esc(d.line)}</p>
        ${d.img ? `<img class="booth-img" src="${esc(d.img)}" referrerpolicy="no-referrer" alt="">` : ''}
        <div class="credits">by <b>${esc(d.name)}</b> ${online ? '· 🟢 here now' : '· not online right now'}${d.link ? ` · <span class="dom">${esc(domain(d.link))}</span>` : ''}</div>
        <div class="menu-buttons">${d.link ? '<button class="menu-btn primary" data-a="open">🔗 Open link</button>' : ''}${online ? '<button class="menu-btn" data-a="find">📍 Find them</button>' : ''}<button class="menu-btn" data-a="close">Close</button></div>
        <div class="credits small">Booths are made by players. Only open links you trust. <a href="#" data-a="hide">Hide this booth</a></div></div>`;
    }
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      e.preventDefault();
      if (a === 'close') this._closeScreen('boothview');
      if (a === 'open' && d?.link) window.open(d.link, '_blank', 'noopener,noreferrer');
      if (a === 'find') { const r = g.remotes.get(d.owner); if (r) { g.player.place(r.pos.x + 1.5, r.pos.z + 1.5); } this._closeScreen('boothview'); }
      if (a === 'hide') { const h = this._hidden(); h.add(`${d.owner}:${d.title}`); try { localStorage.setItem('pb.hiddenBooths', JSON.stringify([...h])); } catch {} this.onBooth(b.n, d); this._closeScreen('boothview'); }
      if (a === 'clear') { g.net?.booth(b.n, null); this.onBooth(b.n, null); this._closeScreen('boothview'); g.hud.toast('Booth taken down.'); }
      if (a === 'save') {
        const title = clean($('bo-title').value).trim(), line = clean($('bo-line').value).trim();
        const linkRaw = $('bo-link').value.trim(), imgRaw = $('bo-img').value.trim();
        const link = linkRaw ? safeUrl(linkRaw) : null, img = imgRaw ? safeUrl(imgRaw) : null;
        if (!title) { g.hud.toast('Give your project a name first.'); return; }
        if ((linkRaw && !link) || (imgRaw && !img)) { g.hud.toast('Links must start with https://'); return; }
        if (!g.net) { g.hud.toast('Booths need online play. Switch on "Play online" in the menu.', 3500); return; }
        const old = this.myBooth();
        if (old && old !== b) { g.net.booth(old.n, null); this.onBooth(old.n, null); }
        const data = { owner: g.profile.id, name: g.profile.name, title, line, link, img, t: Date.now() };
        g.net.booth(b.n, data);
        this.onBooth(b.n, data);
        this._closeScreen('boothview');
        g.hud.toast(`🎉 Your booth is up! People walking through the hall can see “${title}”.`, 4000);
        g.fx.confetti(g.player.pos, 80);
        g.audio.fanfare(false);
      }
    };
  }

  // ------------------------------------------------------------------ presenting

  openPresent() {
    const g = this.g;
    if (this.stage && this.stage.id !== g.profile.id) { g.hud.toast(`${this.stage.name} is presenting right now. Grab a bench!`); return; }
    const P = g.profile;
    const last = P.lastTalk || {};
    const el = this._screen('presentform');
    el.innerHTML = `<div class="menu-card wide"><h2>🎤 Present on stage</h2>
      <div class="credits">Everyone in the hall sees your screen on the big screen and hears you through the PA.</div>
      <div class="form">
        <label>Talk title<input id="pr-title" maxlength="60" value="${esc(last.title || '')}" placeholder="e.g. How I built a hover-auto in a weekend"></label>
        <label>Project link (optional, https)<input id="pr-link" maxlength="300" value="${esc(last.link || '')}" placeholder="https://…"></label>
        <label>Slides (optional): image links, one per line<textarea id="pr-slides" rows="3" placeholder="https://…/slide1.png">${esc((last.slides || []).join('\n'))}</textarea></label>
      </div>
      <div class="menu-buttons">
        <button class="menu-btn primary" data-a="screen">🖥️ Share my screen &amp; start</button>
        <button class="menu-btn" data-a="noscreen">▶️ Start without screen share</button>
        <button class="menu-btn" data-a="close">Cancel</button>
      </div>
      <div class="credits small">Your mic switches on when you start. Screen sharing works on laptops and desktops.</div></div>`;
    el.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'close') { this._closeScreen('presentform'); return; }
      const title = clean($('pr-title').value).trim() || `${P.name}'s talk`;
      const linkRaw = $('pr-link').value.trim(), link = linkRaw ? safeUrl(linkRaw) : null;
      const slides = $('pr-slides').value.split(/\s+/).map(safeUrl).filter(Boolean).slice(0, 30);
      if (linkRaw && !link) { g.hud.toast('Links must start with https://'); return; }
      P.lastTalk = { title, link, slides };
      g.saveProfile();
      this._closeScreen('presentform');
      let screen = false;
      if (a === 'screen') screen = await this.share.start();
      this.startPresenting({ title, link, slides, screen });
    };
  }

  startPresenting({ title, link, slides, screen }) {
    const g = this.g;
    this.presenting = true;
    this.hands.clear();
    this.stage = { id: g.profile.id, name: g.profile.name, title, link, slides, i: 0, screen, since: Date.now(), t: performance.now() };
    g.voice.onStage = true;
    g.voice.setMic(true);
    this._broadcast();
    this._refreshScreen();
    this.stateT = 0;
    g.hud.big('YOU\'RE LIVE 🎤', title, 2200);
    g.audio.fanfare(false);
    g.net?.event('hall:chat', { text: `🎤 ${g.profile.name} is presenting “${title}” in the Meetup Hall` });
    this._renderBar(true);
  }

  async shareScreenNow() {
    if (!this.presenting || this.stage.screen) return;
    if (await this.share.start()) { this.stage.screen = true; this._broadcast(); this._refreshScreen(); this._renderBar(true); }
  }

  stopScreen() {
    if (!this.presenting) return;
    this.share.stop();
    this.stage.screen = false;
    this._broadcast();
    this._refreshScreen();
    this._renderBar(true);
  }

  stopPresenting() {
    const g = this.g;
    if (!this.presenting) return;
    this.presenting = false;
    this.share.stop();
    g.net?.event('stage:stop', {});
    if (this.floor) g.net?.event('hall:floor', { to: this.floor, on: false });
    this.floor = null;
    this.stage = null;
    g.voice.onStage = false;
    this._refreshScreen();
    g.hud.toast('Talk finished. Big applause! 👏', 3000);
    g.addCoins(25, g.player.pos);
    this._renderBar(true);
  }

  _broadcast() {
    const st = this.stage;
    if (!st || !this.presenting) return;
    this.g.net?.event('stage:state', { title: st.title, link: st.link, slides: st.slides, i: st.i, screen: !!st.screen, since: st.since });
  }

  slide(dir) {
    const st = this.stage;
    if (!this.presenting || !st.slides?.length) return;
    st.i = Math.max(0, Math.min(st.slides.length - 1, (st.i || 0) + dir));
    this._broadcast();
    this._refreshScreen();
    this._renderBar(true);
  }

  react(i) {
    const g = this.g;
    if (performance.now() - this.reactT < 600) return;
    this.reactT = performance.now();
    g.net?.event('hall:react', { e: i });
    this._showReact(g.player.pos, i);
  }

  _showReact(pos, i) {
    const e = REACTS[i];
    if (!e) return;
    this.g.labels.pop(e, pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.4, 0)), 'pop react');
    if (this.inside(this.g.player.pos)) this.g.audio.blip(1.6 + i * 0.1, 1);
  }

  raiseHand() {
    this.handUp = !this.handUp;
    this.g.net?.event('hall:hand', { on: this.handUp });
    if (this.handUp) { this.g.player.avatar.play('wave', 2.5); this.g.hud.toast('✋ Hand raised. The presenter can give you the floor.', 2500); }
    this._renderBar(true);
  }

  giveFloor(id) {
    if (!this.presenting) return;
    if (this.floor) this.g.net?.event('hall:floor', { to: this.floor, on: false });
    this.floor = this.floor === id ? null : id;
    if (this.floor) this.g.net?.event('hall:floor', { to: id, on: true });
    this.hands.delete(id);
    this._renderBar(true);
  }

  // ------------------------------------------------------------------ network

  onNet(peer, type, d) {
    const g = this.g, now = performance.now();
    if (type === 'stage:want' || type === 'stage:rtc') { this.share.onNet(peer, type, d); return; }
    if (type === 'stage:state') {
      if (this.presenting) {
        // two people started at once: the earlier one keeps the stage
        if ((+d.since || 0) < this.stage.since || ((+d.since || 0) === this.stage.since && peer.id < g.profile.id)) { this.stopPresenting(); g.hud.toast(`${peer.name} got on stage first.`); }
        else return;
      }
      const prev = this.stage;
      const slides = Array.isArray(d.slides) ? d.slides.map(safeUrl).filter(Boolean).slice(0, 30) : [];
      this.stage = { id: peer.id, name: peer.name, title: clean(d.title || '').slice(0, 60), link: safeUrl(d.link), slides, i: Math.max(0, Math.min(slides.length - 1, d.i | 0)), screen: !!d.screen, since: +d.since || 0, t: now };
      if (!prev || prev.id !== peer.id) { if (this.inside(g.player.pos)) g.hud.toast(`🎤 ${peer.name} is on stage: “${this.stage.title}”`, 3500); this.handUp = false; }
      if (!this.stage.screen && this.share.inc) this.share.dropIncoming();
      if (!prev || prev.id !== peer.id || prev.i !== this.stage.i || prev.screen !== this.stage.screen || prev.title !== this.stage.title) this._refreshScreen();
      this._renderBar(true);
      return;
    }
    if (type === 'stage:stop') {
      if (this.stage && this.stage.id === peer.id) { this.stage = null; this.share.dropIncoming(); this._refreshScreen(); this._renderBar(true); }
      if (this.floorOn) this._setFloor(false);
      return;
    }
    if (type === 'hall:react') { const r = g.remotes.get(peer.id); if (r && this.inside(r.pos)) this._showReact(r.pos, d.e | 0); return; }
    if (type === 'hall:hand') {
      if (!this.presenting) return;
      if (d.on) { this.hands.set(peer.id, peer.name); g.audio.chat(); } else this.hands.delete(peer.id);
      this._renderBar(true);
      return;
    }
    if (type === 'hall:floor') { if (d.to === g.profile.id && this.stage && this.stage.id === peer.id) this._setFloor(!!d.on); return; }
    if (type === 'hall:chat') { g.hud.chat(null, clean(d.text || '').slice(0, 90), true); }
  }

  _setFloor(on) {
    const g = this.g;
    this.floorOn = on;
    g.voice.onStage = on || this.presenting;
    this.handUp = false;
    if (on) { g.voice.setMic(true); g.hud.big('YOU HAVE THE FLOOR 🎤', 'The whole hall can hear you', 2200); }
    else g.hud.toast('Thanks for your question! 🙏', 2000);
    g.sendT = 0;
    this._renderBar(true);
  }

  // ------------------------------------------------------------------ meetup calendar

  async refreshMeetups() {
    try { this.meetups = await listMeetups(); } catch { this.meetups = []; }
    this.meetupsT = performance.now();
    if (!this.stage) this._idleDraw();
    return this.meetups;
  }

  async openCalendar() {
    const g = this.g;
    const el = this._screen('calendar');
    el.innerHTML = '<div class="menu-card wide"><h2>📅 Meetup Calendar</h2><div class="lb-list">Loading…</div></div>';
    await this.refreshMeetups();
    if (el.classList.contains('hidden')) return;
    const reminders = this._reminders();
    const list = this.meetups.map((m) => {
      const live = m.at <= Date.now();
      const mine = m.host === g.profile.id;
      return `<div class="mu-item${live ? ' live' : ''}"><div class="mu-when">${live ? '● LIVE NOW' : esc(fmtWhen(m.at))}<small>${esc(ZONES[m.zone]?.short || m.zone)}${m.room !== 'public' ? ' · private room' : ''} · ${m.dur} min</small></div>
        <div class="mu-what"><b>${esc(m.title)}</b><span>${esc(m.desc)}</span><small>hosted by ${esc(m.hostName)}</small></div>
        <div class="mu-acts"><button class="mini buy" data-go="${m.id}">${live ? 'Join' : 'Go to hall'}</button>${live ? '' : `<button class="mini" data-rem="${m.id}">${reminders[m.id] ? '🔔 On' : '🔔 Remind'}</button>`}${mine ? `<button class="mini" data-del="${m.id}">Cancel</button>` : ''}</div></div>`;
    }).join('') || '<div class="credits">No meetups scheduled yet. Host the first one!</div>';
    const now = new Date(Date.now() + 3600000);
    const def = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 13) + ':00';
    const zoneOpts = Object.entries(ZONES).map(([k, z]) => `<option value="${k}"${k === this.zone ? ' selected' : ''}>${esc(z.short)}</option>`).join('');
    el.innerHTML = `<div class="menu-card wide"><h2>📅 Meetup Calendar</h2>
      <div class="credits">Talks, demo days, study groups, startup hangouts. Meet in a district's Meetup Hall at the time.</div>
      <div class="mu-list">${list}</div>
      <details class="mu-new"><summary>➕ Host a meetup</summary>
        <div class="form">
          <label>Title<input id="mu-title" maxlength="60" placeholder="e.g. Indie Game Devs of Bengaluru"></label>
          <label>What's it about?<input id="mu-desc" maxlength="200" placeholder="Short description"></label>
          <label>When<input id="mu-at" type="datetime-local" value="${def}"></label>
          <div class="form-row"><label>How long<select id="mu-dur"><option value="30">30 min</option><option value="60" selected>1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label>
          <label>Where<select id="mu-zone">${zoneOpts}</select></label></div>
          <label class="toggle"><input type="checkbox" id="mu-private"${g.profile.room !== 'public' ? ' checked' : ''}> In my private room (only people with the invite link)</label>
        </div>
        <div class="menu-buttons"><button class="menu-btn primary" data-a="host">Schedule it</button></div>
      </details>
      <div class="menu-buttons"><button class="menu-btn" data-a="close">Close</button></div></div>`;
    el.onclick = async (e) => {
      const t = e.target;
      const go = t.closest('[data-go]')?.dataset.go, rem = t.closest('[data-rem]')?.dataset.rem, del = t.closest('[data-del]')?.dataset.del;
      const a = t.closest('[data-a]')?.dataset.a;
      if (a === 'close') this._closeScreen('calendar');
      if (go) { const m = this.meetups.find((x) => x.id === go); this._closeScreen('calendar'); if (m) this.s.goToMeetup(m); }
      if (rem) { const r = this._reminders(); if (r[rem]) delete r[rem]; else { const m = this.meetups.find((x) => x.id === rem); if (m) r[rem] = { at: m.at, title: m.title, zone: m.zone, room: m.room }; } this._saveReminders(r); this.openCalendar(); }
      if (del) { await postMeetup(del, null); g.hud.toast('Meetup cancelled.'); this.openCalendar(); }
      if (a === 'host') {
        const title = clean($('mu-title').value).trim(), desc = clean($('mu-desc').value).trim();
        const at = new Date($('mu-at').value).getTime(), dur = +$('mu-dur').value, zone = $('mu-zone').value;
        if (!title) { g.hud.toast('Give your meetup a title.'); return; }
        if (!(at > Date.now() - 600000) || at > Date.now() + 30 * DAY) { g.hud.toast('Pick a time in the next 30 days.'); return; }
        const mineCount = this.meetups.filter((m) => m.host === g.profile.id).length;
        if (mineCount >= 3) { g.hud.toast('You already host 3 meetups. Cancel one first.'); return; }
        let room = 'public';
        if ($('mu-private').checked) {
          room = g.profile.room !== 'public' ? g.profile.room : makeId().slice(0, 6);
          g.profile.room = room; g.saveProfile();
        }
        const id = g.profile.id + Date.now().toString(36).slice(-5);
        const ok = await postMeetup(id, { title, desc, at, dur, zone, room, host: g.profile.id, hostName: g.profile.name, t: Date.now() });
        if (!ok) { g.hud.toast('Could not reach the meetup servers. Try again in a bit.'); return; }
        const r = this._reminders(); r[id] = { at, title, zone, room }; this._saveReminders(r);
        g.hud.toast(`📅 “${title}” is on the calendar! ${room !== 'public' ? 'Share your invite link so people can join your room.' : ''}`, 4500);
        g.audio.fanfare(false);
        this.openCalendar();
      }
    };
  }

  _reminders() { try { return JSON.parse(localStorage.getItem('pb.reminders') || '{}'); } catch { return {}; } }
  _saveReminders(r) { try { localStorage.setItem('pb.reminders', JSON.stringify(r)); } catch {} }

  checkReminders() {
    const r = this._reminders(), now = Date.now();
    let changed = false;
    for (const [id, m] of Object.entries(r)) {
      if (m.at - now < 5 * 60000 && !m.told) {
        m.told = true; changed = true;
        this.g.hud.chat(null, `🔔 Starting ${m.at > now ? 'in ' + Math.max(1, Math.round((m.at - now) / 60000)) + ' min' : 'now'}: “${m.title}” at the ${ZONES[m.zone]?.short || m.zone} Meetup Hall. Open the 📅 calendar to go.`, true);
        this.g.hud.toast(`🔔 Meetup soon: ${m.title}`, 4000);
        this.g.audio.fanfare(false);
      }
      if (m.at < now - 6 * 3600000) { delete r[id]; changed = true; }
    }
    if (changed) this._saveReminders(r);
  }

  // ------------------------------------------------------------------ DOM bits

  _screen(id) {
    let el = $(id);
    if (!el) { el = document.createElement('div'); el.id = id; el.className = 'screen hall-screen'; document.getElementById('app').appendChild(el); }
    el.classList.remove('hidden');
    if (this.g.state === 'play') { this._prev = 'play'; this.g.state = 'paused'; }
    return el;
  }

  _closeScreen(id) {
    $(id)?.classList.add('hidden');
    if (this._prev && !document.querySelector('.hall-screen:not(.hidden)')) { this.g.state = this._prev; this._prev = null; }
  }

  closeAny() {
    const open = document.querySelector('.hall-screen:not(.hidden)');
    if (!open) return false;
    if (open.id === 'fullview') this.closeFull(); else this._closeScreen(open.id);
    return true;
  }

  openFull() {
    const st = this.stage;
    if (!st) return;
    const el = this._screen('fullview');
    el.innerHTML = '';
    const box = document.createElement('div'); box.className = 'full-box';
    const head = document.createElement('div'); head.className = 'full-head';
    head.innerHTML = `<b>🎤 ${esc(st.name)}: ${esc(st.title)}</b>${st.link ? `<button class="mini buy" data-a="open">🔗 ${esc(domain(st.link))}</button>` : ''}<button class="mini" data-a="close">✕ Back to the hall</button>`;
    box.appendChild(head);
    const v = this.share.video;
    if (st.screen && v) { v.className = 'full-media'; box.appendChild(v); v.play().catch(() => {}); }
    else if (st.slides?.[st.i || 0]) { const img = document.createElement('img'); img.className = 'full-media'; img.referrerPolicy = 'no-referrer'; img.src = st.slides[st.i || 0]; box.appendChild(img); }
    else { const p = document.createElement('div'); p.className = 'full-empty'; p.textContent = st.screen ? 'Connecting to the screen share…' : 'No screen or slides shared. Just listen in!'; box.appendChild(p); }
    el.appendChild(box);
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') this.closeFull();
      if (a === 'open' && st.link) window.open(st.link, '_blank', 'noopener,noreferrer');
    };
  }

  closeFull() { const v = this.share.video; if (v && v.parentNode) v.remove(); this._closeScreen('fullview'); }

  _barClick(e) {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    e.stopPropagation();
    const a = t.dataset.a;
    if (a.startsWith('r')) this.react(+a.slice(1));
    if (a === 'hand') this.raiseHand();
    if (a === 'full') this.openFull();
    if (a === 'link' && this.stage?.link) window.open(this.stage.link, '_blank', 'noopener,noreferrer');
    if (a === 'mic') this.g.ui?.toggleMic();
    if (a === 'prev') this.slide(-1);
    if (a === 'next') this.slide(1);
    if (a === 'share') this.shareScreenNow();
    if (a === 'unshare') this.stopScreen();
    if (a === 'end') this.stopPresenting();
    if (a === 'cal') this.openCalendar();
    if (a.startsWith('floor:')) this.giveFloor(a.slice(6));
  }

  _renderBar(force) {
    const g = this.g, el = this.bar;
    const inside = this.inside(g.player.pos);
    const st = this.stage;
    let html = '';
    if (this.presenting) {
      const hands = [...this.hands.entries()].map(([id, n]) => `<button data-a="floor:${id}" class="hand">✋ ${esc(n)} · give floor</button>`).join('');
      const fl = this.floor ? `<button data-a="floor:${this.floor}" class="hand on">🎤 ${esc(g.remotes.get(this.floor)?.peer.name || 'guest')} · take back</button>` : '';
      html = `<span class="live">● LIVE</span><b class="ttl">${esc(st.title)}</b>
        <button data-a="mic">${g.voice.micOn ? '🎙️ Mic on' : '🔇 Mic off'}</button>
        ${st.slides?.length ? `<button data-a="prev">◀</button><span class="dim">${(st.i || 0) + 1}/${st.slides.length}</span><button data-a="next">▶</button>` : ''}
        ${st.screen ? '<button data-a="unshare">Stop sharing</button>' : '<button data-a="share">🖥️ Share screen</button>'}
        ${fl}${hands}<button data-a="end" class="end">⏹ End talk</button>`;
    } else if (inside && st) {
      html = `<span class="live">🎤</span><b class="ttl">${esc(st.name)}: ${esc(st.title)}</b>
        ${REACTS.map((r, i) => `<button data-a="r${i}" class="re">${r}</button>`).join('')}
        <button data-a="hand"${this.handUp ? ' class="on"' : ''}>✋</button>
        <button data-a="full">⛶ Full view</button>${st.link ? '<button data-a="link">🔗 Link</button>' : ''}${this.floorOn ? '<span class="dim">🎤 You have the floor</span>' : ''}`;
    } else if (inside) {
      html = '<b class="ttl">Namma Meetup Hall</b><span class="dim">Walk up on the stage to present · visit the booths</span><button data-a="cal">📅 Calendar</button>';
    }
    const key = html;
    if (!force && key === this._barKey) return;
    this._barKey = key;
    el.innerHTML = html;
    el.classList.toggle('hidden', !html);
    document.body.classList.toggle('in-hall', !!html);
  }

  // ------------------------------------------------------------------ per frame

  // What the action button would do here (stage / booth / bench / calendar board), or null.
  want() {
    const g = this.g, p = g.player.pos;
    if (!this.inside(p) && Math.hypot(p.x - this.spots.board[0], p.z - this.spots.board[1]) > 3) return null;
    if (this.onStage(p) && !this.presenting && (!this.stage || this.stage.id === g.profile.id)) return { text: '🎤 Present your work', act: () => this.openPresent() };
    if (Math.hypot(p.x - this.spots.board[0], p.z - this.spots.board[1]) < 2.6) return { text: '📅 Meetup Calendar', act: () => this.openCalendar() };
    for (const b of this.booths) {
      if (Math.hypot(p.x - b.stand[0], p.z - b.stand[1]) < 2.4) {
        const mine = b.data && b.data.owner === g.profile.id;
        return { text: !b.data ? '🧑‍💻 Put your project in this booth' : mine ? '✏️ Edit your booth' : `👀 Visit: ${b.data.title}`, act: () => this.openBooth(b) };
      }
    }
    if (g.myEmote !== 'sit' && g.player.mode === 'walk') {
      const [lx, lz] = this.local(p);
      for (const b of this.benches) if (Math.abs(lx - b.x) < 3.1 && Math.abs(lz - b.z) < 1.1) {
        return { text: 'Sit and watch', act: () => {
          const [wx, wz] = this.kit.w(Math.max(b.x - 2.8, Math.min(b.x + 2.8, lx)), b.z);
          g.player.place(wx, wz, this.yaw + Math.PI, 0.6);
          g.camRig.yaw = this.yaw + Math.PI;
          g.doEmote('sit');
        } };
      }
    }
    return null;
  }

  update(dt) {
    const g = this.g, p = g.player.pos, now = performance.now();
    const inside = this.inside(p);
    // presenter: keep everyone in sync; stop if you walk out of the hall
    if (this.presenting) {
      this.stateT -= dt;
      if (this.stateT <= 0) { this.stateT = 4; this._broadcast(); }
      if (!inside) { this.outT = (this.outT || 0) + dt; if (this.outT > 4) { this.stopPresenting(); g.hud.toast('You left the hall, so your talk ended.'); } }
      else this.outT = 0;
    } else if (this.stage && now - this.stage.t > 14000) {
      this.stage = null; this.share.dropIncoming(); this._refreshScreen(); this._renderBar(true);
    }
    // viewers in the hall pull the live screen
    if (!this.presenting && this.stage?.screen && inside) this.share.want(this.stage.id);
    else if (!this.presenting && this.share.inc && !inside) this.share.dropIncoming();
    if (this.floorOn && !this.stage) this._setFloor(false);
    // the presenter's own voice goes over the PA (flag), the hall chat banner etc.
    this.barT = (this.barT || 0) - dt;
    if (this.barT <= 0) { this.barT = 0.3; this._renderBar(); }
    if (now - (this.meetupsT || 0) > 120000) this.refreshMeetups();
    this.remT = (this.remT || 0) - dt;
    if (this.remT <= 0) { this.remT = 20; this.checkReminders(); }
    // booth owners keep their booth alive while they play here
    this.boothT = (this.boothT || 0) - dt;
    if (this.boothT <= 0) {
      this.boothT = 600;
      const b = this.myBooth();
      if (b && Date.now() - b.data.t > 3600000 && g.net) { const data = { ...b.data, t: Date.now() }; g.net.booth(b.n, data); b.data = data; }
    }
    if (this.videoTex && this.share.video && this.share.video.readyState < 2) this.share.video.play?.().catch(() => {});
  }
}
