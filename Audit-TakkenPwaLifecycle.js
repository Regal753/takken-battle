"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(process.argv[2] || "pwa-runtime.js", "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ online = true, failRegistration = false } = {}) {
  const events = () => ({
    listeners: new Map(),
    addEventListener(name, fn) {
      const handlers = this.listeners.get(name) || [];
      handlers.push(fn); this.listeners.set(name, handlers);
    },
    fire(name) { for (const fn of this.listeners.get(name) || []) fn(); }
  });
  let now = 0;
  const calls = { register: 0, update: 0, reload: 0, activate: 0, writes: 0 };
  const nodes = new Map();
  const document = { ...events(), visibilityState: "visible",
    getElementById: id => nodes.get(id) || null,
    createElement: () => ({ ...events(), children: [], style: { removeProperty() {} },
      setAttribute() {}, append(child) { this.children.push(child); } }),
    body: { append(node) { nodes.set(node.id, node); } }
  };
  let rejectRegister = failRegistration;
  let resolveUpdate = null;
  const registration = { ...events(), waiting: null,
    async update() { calls.update += 1; await new Promise(resolve => { resolveUpdate = resolve; }); }
  };
  const navigator = { onLine: online, serviceWorker: { ...events(), controller: {},
    async register() {
      calls.register += 1;
      if (rejectRegister) { rejectRegister = false; throw new Error("offline registration"); }
      return registration;
    }
  } };
  const window = { ...events(), isSecureContext: true, innerHeight: 844,
    location: { reload() { calls.reload += 1; } } };
  const storage = { setItem() { calls.writes += 1; }, removeItem() { calls.writes += 1; }, clear() { calls.writes += 1; } };
  vm.runInNewContext(source, { window, document, navigator, Date: { now: () => now },
    localStorage: storage, sessionStorage: storage, ResizeObserver: class {}, MutationObserver: class {} });
  return { window, document, navigator, registration, calls, nodes,
    advance(ms) { now += ms; }, finishUpdate() { resolveUpdate?.(); },
    waiting() { registration.waiting = { postMessage() { calls.activate += 1; } }; }
  };
}

(async () => {
  const failed = fixture({ failRegistration: true });
  failed.window.fire("load"); await flush();
  failed.window.fire("online"); await flush();
  assert.equal(failed.calls.register, 2, "failed registration must retry without a reload");
  assert.equal(failed.registration.listeners.get("updatefound").length, 1, "registration listeners must not multiply");

  const offline = fixture({ online: false });
  offline.window.fire("load"); await flush();
  assert.equal(offline.calls.register, 0, "offline startup should defer registration");
  offline.navigator.onLine = true; offline.window.fire("online"); await flush();
  assert.equal(offline.calls.register, 1, "reconnect must register after offline startup");

  failed.document.visibilityState = "hidden"; failed.advance(61_000);
  failed.document.fire("visibilitychange"); failed.window.fire("pageshow"); await flush();
  assert.equal(failed.calls.update, 0, "hidden apps must not check for updates");
  failed.document.visibilityState = "visible";
  failed.document.fire("visibilitychange"); failed.window.fire("online"); await flush();
  assert.equal(failed.calls.update, 1, "visible foreground check should be coalesced with reconnect");
  failed.advance(61_000); failed.window.fire("pageshow"); await flush();
  assert.equal(failed.calls.update, 1, "only one check may be in flight");
  failed.waiting(); failed.finishUpdate(); await flush();
  failed.window.fire("pageshow"); await flush();
  assert.equal(failed.calls.update, 2, "pageshow must check after the interval");
  failed.finishUpdate(); await flush();
  failed.window.fire("online"); failed.document.fire("visibilitychange"); await flush();
  assert.equal(failed.calls.update, 2, "successful checks should be throttled for one minute");
  assert.equal(failed.nodes.size, 1, "repeated checks should keep one update notice");
  assert.equal(failed.calls.reload, 0, "discovery must not reload an unfinished answer");
  assert.equal(failed.calls.activate, 0, "discovery must not activate a waiting worker");
  assert.equal(failed.calls.writes, 0, "update discovery must not write learning data");
  const button = failed.nodes.get("pwaUpdateNotice").children[1];
  button.fire("click");
  assert.equal(failed.calls.activate, 1, "explicit button must activate the update");
  failed.navigator.serviceWorker.fire("controllerchange");
  assert.equal(failed.calls.reload, 1, "explicit update reloads after controllerchange");
  console.log("Audit-TakkenPwaLifecycle: OK (offline/retry/foreground/throttle/coalescing/manual activation; no save writes)");
})().catch(error => { console.error(error); process.exitCode = 1; });
