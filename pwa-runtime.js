"use strict";

(() => {
  const VERSION = "20261004-pwa-reconnect-580af685a0a1";
  const BANNER_ID = "pwaUpdateNotice";
  const UPDATE_CHECK_INTERVAL_MS = 60_000;
  let reloadRequested = false;
  let registration = null;
  let checkInFlight = null;
  let lastCheckAt = -Infinity;

  const showUpdateNotice = (registration) => {
    if (!registration?.waiting || document.getElementById(BANNER_ID)) return;
    const notice = document.createElement("section");
    notice.id = BANNER_ID;
    notice.className = "pwa-update-notice";
    notice.setAttribute("role", "status");
    const message = document.createElement("p");
    message.textContent = "新しい教材データを取得済みです。今の解答は保存されています。";
    notice.append(message);
    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "自分で更新する";
    reload.addEventListener("click", () => {
      reload.disabled = true;
      reloadRequested = true;
      registration.waiting.postMessage({ type: "TAKKEN_SKIP_WAITING" });
    });
    notice.append(reload);
    document.body.append(notice);

    // The answer dock is fixed and its height differs between normal practice,
    // timed mocks, and narrow screens. Measure it instead of guessing with a
    // breakpoint so the update control never covers the next action.
    const positionAboveAnswerDock = () => {
      const dock = document.getElementById("answerDock");
      const dockRect = dock && !dock.hidden ? dock.getBoundingClientRect() : null;
      if (!dockRect || dockRect.height <= 0 || dockRect.top >= window.innerHeight) {
        notice.style.removeProperty("bottom");
        return;
      }
      notice.style.bottom = `${Math.ceil(window.innerHeight - dockRect.top + 12)}px`;
    };
    positionAboveAnswerDock();
    window.addEventListener("resize", positionAboveAnswerDock, { passive: true });
    const dock = document.getElementById("answerDock");
    if (dock) {
      new ResizeObserver(positionAboveAnswerDock).observe(dock);
      new MutationObserver(positionAboveAnswerDock).observe(dock, {
        attributes: true,
        attributeFilter: ["class", "hidden", "style"]
      });
    }
  };

  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadRequested) window.location.reload();
    });
    const checkForUpdate = () => {
      if (reloadRequested || navigator.onLine === false || document.visibilityState === "hidden") return;
      if (checkInFlight || Date.now() - lastCheckAt < UPDATE_CHECK_INTERVAL_MS) return;
      lastCheckAt = Date.now();
      checkInFlight = (async () => {
        if (!registration) {
          registration = await navigator.serviceWorker.register(`./service-worker.js?v=${VERSION}`, {
            scope: "./", updateViaCache: "none"
          });
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateNotice(registration);
              }
            });
          });
        } else {
          await registration.update();
        }
        showUpdateNotice(registration);
      })().catch(() => {
        // Offline/blocked registration must be retryable on the next reconnect.
        // Checking never activates a worker or reloads an unfinished answer.
        lastCheckAt = -Infinity;
      }).finally(() => { checkInFlight = null; });
    };
    window.addEventListener("online", checkForUpdate);
    window.addEventListener("pageshow", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
    checkForUpdate();
  });
})();
