// Scheduler Web Worker — fires 'tick' messages at a fixed interval.
// Workers are never throttled by the browser, even in cross-origin iframes.
// The main thread listens and calls schLoop() on each tick.

let id: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent<{ type: string; interval?: number }>) => {
  if (e.data.type === 'start') {
    if (id !== null) clearInterval(id);
    const ms = e.data.interval ?? 25;
    id = setInterval(() => (self as DedicatedWorkerGlobalScope).postMessage('tick'), ms);
  } else if (e.data.type === 'stop') {
    if (id !== null) { clearInterval(id); id = null; }
  }
};
