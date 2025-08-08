import fs from 'fs';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const WIDTH = 1000;
const HEIGHT = 1000;
const PORT = process.env.PORT || 8080;
const SAVE_FILE = path.join(__dirname, 'state.bin');
const SAVE_INTERVAL_MS = 10000;
const MAX_RATE_MS = 800;
const PALETTE = [
  [0,0,0,255],[255,255,255,255],[255,0,0,255],[0,255,0,255],
  [0,0,255,255],[255,255,0,255],[255,165,0,255],[255,0,255,255],
  [0,255,255,255],[128,128,128,255],[139,69,19,255],[255,192,203,255],
  [128,0,128,255],[0,128,0,255],[0,0,128,255],[255,215,0,255]
];
const SIZE = WIDTH * HEIGHT;
let data = Buffer.allocUnsafe(SIZE);
data.fill(1);

try {
  if (fs.existsSync(SAVE_FILE)) {
    const buf = fs.readFileSync(SAVE_FILE);
    if (buf.length === SIZE) data = Buffer.from(buf);
  }
} catch {}

setInterval(() => {
  try { fs.writeFileSync(SAVE_FILE, data); } catch {}
}, SAVE_INTERVAL_MS);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws._lastSet = 0;
  ws.send(JSON.stringify({ t: 'init', w: WIDTH, h: HEIGHT, palette: PALETTE }));
  ws.send(data, { binary: true });
  ws.on('message', (msg, isBinary) => {
    if (isBinary) return;
    try {
      const m = JSON.parse(msg.toString());
      if (m.t === 'set') {
        const now = Date.now();
        if (now - ws._lastSet < MAX_RATE_MS) {
          ws.send(JSON.stringify({ t: 'cooldown', remaining: MAX_RATE_MS - (now - ws._lastSet) }));
          return;
        }
        const { x, y, c } = m;
        if (Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(c)
            && x>=0 && x<WIDTH && y>=0 && y<HEIGHT && c>=0 && c<PALETTE.length) {
          const idx = y*WIDTH + x;
          if (data[idx] !== c) {
            data[idx] = c;
            ws._lastSet = now;
            const upd = JSON.stringify({ t: 'update', x, y, c });
            for (const client of wss.clients) {
              if (client.readyState === 1) client.send(upd);
            }
          }
        }
      }
    } catch {}
  });
});

server.listen(PORT, () => {
  console.log(`r/place-lite running on port ${PORT}`);
});
