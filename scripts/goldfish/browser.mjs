/**
 * Minimal Chrome DevTools Protocol client.
 * MTGGoldfish sits behind Cloudflare, which rejects plain HTTP clients.
 * Headless Chrome is the same approach that can actually load the pages.
 */

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 mtg-meta-snapshot/1.0 (+https://github.com/trickytricky08/mtg-meta)";

export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      execFileSync("which", [name], { stdio: "ignore" });
      return name;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    "Google Chrome is required to fetch MTGGoldfish. Set CHROME_PATH or install google-chrome."
  );
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 0;
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}, timeoutMs = 20000) {
          const id = ++nextId;
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`CDP timeout: ${method}`));
            }, timeoutMs);
            pending.set(id, {
              resolve: (value) => {
                clearTimeout(timer);
                res(value);
              },
              reject: (error) => {
                clearTimeout(timer);
                rej(error);
              },
            });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          ws.close();
        },
      });
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    });
    ws.addEventListener("error", () => reject(new Error("Chrome DevTools socket failed")));
  });
}

async function waitForJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error("Chrome DevTools did not start");
}

export async function withChrome(run) {
  const chromePath = findChrome();
  const profile = mkdtempSync(join(tmpdir(), "mtg-meta-chrome-"));
  const port = 9200 + Math.floor(Math.random() * 700);
  const child = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      `--user-agent=${USER_AGENT}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true }
  );

  let browser;
  let page;
  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    browser = await connect(version.webSocketDebuggerUrl);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    await sleep(200);
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const target = targets.find((entry) => entry.id === targetId);
    if (!target?.webSocketDebuggerUrl) throw new Error("Chrome tab did not open");
    page = await connect(target.webSocketDebuggerUrl);
    await page.send("Page.enable");
    await page.send("Runtime.enable");

    async function evaluate(expression, timeoutMs = 20000) {
      let lastError;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const result = await page.send(
            "Runtime.evaluate",
            { expression, awaitPromise: true, returnByValue: true },
            timeoutMs
          );
          if (result.exceptionDetails) {
            const text =
              result.exceptionDetails.exception?.description ||
              result.exceptionDetails.text ||
              "Page script failed";
            throw new Error(text);
          }
          return result.result?.value;
        } catch (error) {
          lastError = error;
          if (!/context|destroyed|navigation|Execution context/i.test(String(error))) throw error;
          await sleep(300);
        }
      }
      throw lastError;
    }

    async function navigate(url) {
      await page.send("Page.navigate", { url });
    }

    return await run({ navigate, evaluate });
  } finally {
    try {
      page?.close();
    } catch {
      // The tab socket may already be gone.
    }
    try {
      browser?.close();
    } catch {
      // The browser socket may already be gone.
    }
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    rmSync(profile, { recursive: true, force: true });
  }
}
