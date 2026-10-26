import { writeFile } from "node:fs/promises";

const targets = await fetch("http://127.0.0.1:9223/json/list").then((response) => response.json());
const target = targets.find((entry) => entry.type === "page");
if (!target) throw new Error("No Chrome page target found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let id = 0;
const pending = new Map();
const events = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) {
    if (message.method === "Runtime.exceptionThrown" || message.method === "Runtime.consoleAPICalled") events.push(message);
    return;
  }
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function call(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}

await call("Page.enable");
await call("Runtime.enable");
await call("Page.navigate", { url: "http://127.0.0.1:3100/" });
await new Promise((resolve) => setTimeout(resolve, 5000));
const coatClick = await call("Runtime.evaluate", {
  expression: `(() => { const buttons = [...document.querySelectorAll('button')]; const button = buttons.find((item) => item.getAttribute('aria-label') === 'Choose Sage Corduroy'); button?.click(); return { labels: buttons.map((item) => item.getAttribute('aria-label') || item.textContent.trim()), clicked: Boolean(button), react: Object.keys(button || {}).filter((key) => key.startsWith('__react')) }; })()`,
  returnByValue: true,
});
await new Promise((resolve) => setTimeout(resolve, 1000));
const modeClick = await call("Runtime.evaluate", {
  expression: `(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === '3D'); button?.click(); return Boolean(button); })()`,
  returnByValue: true,
});
console.log(JSON.stringify({ coatClick: coatClick.result.value, modeClick: modeClick.result.value }));
await new Promise((resolve) => setTimeout(resolve, 10000));
const state = await call("Runtime.evaluate", {
  expression: `({ pressed: [...document.querySelectorAll('button[aria-pressed="true"]')].map((item) => item.getAttribute('aria-label') || item.textContent.trim()), busy: [...document.querySelectorAll('[aria-busy="true"]')].length })`,
  returnByValue: true,
});
console.log(JSON.stringify({ state: state.result.value }));
console.log(JSON.stringify({ eventCount: events.length }));
const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(".scratch/collar-render.png", Buffer.from(data, "base64"));
socket.close();
