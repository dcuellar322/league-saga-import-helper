import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [, , outputPath, expression = ''] = process.argv;
if (!outputPath) throw new Error('Usage: node scripts/capture-cdp.mjs <output.png> [expression]');

const targets = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json());
const target = targets.find((candidate) => candidate.type === 'page' && candidate.title === 'LeagueSaga Import Helper');
if (!target?.webSocketDebuggerUrl) throw new Error('LeagueSaga renderer target was not found.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
let commandId = 0;
const pending = new Map();

socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data.toString());
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

if (expression) {
  await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  await new Promise((resolve) => setTimeout(resolve, 250));
}

await send('Page.enable');
const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(data, 'base64'));
socket.close();
