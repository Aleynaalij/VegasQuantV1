"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [ios, setIos] = useState(false),
    [installed, setInstalled] = useState(false),
    [help, setHelp] = useState(false),
    [update, setUpdate] = useState<ServiceWorker | null>(null),
    [offline, setOffline] = useState(false),
    [updating, setUpdating] = useState(false);
  useEffect(() => {
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        !!(navigator as Navigator & { standalone?: boolean }).standalone,
    );
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setOffline(!navigator.onLine);
    const install = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const done = () => setInstalled(true);
    const network = () => setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", done);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    let live = true;
    let registration: ServiceWorkerRegistration | undefined;
    const workers = new Map<ServiceWorker, () => void>();
    const watch = (worker: ServiceWorker | null) => {
      if (!worker || workers.has(worker)) return;
      const changed = () => {
        if (!live) return;
        if (worker.state === "installed" && navigator.serviceWorker.controller)
          setUpdate(worker);
        if (worker.state === "activated" || worker.state === "redundant")
          setUpdate((current) => (current === worker ? null : current));
      };
      workers.set(worker, changed);
      worker.addEventListener("statechange", changed);
      changed();
    };
    const found = () => watch(registration?.installing || null);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          if (!live) return;
          registration = reg;
          watch(reg.waiting);
          watch(reg.installing);
          reg.addEventListener("updatefound", found);
        })
        .catch(() => {});
    return () => {
      live = false;
      registration?.removeEventListener("updatefound", found);
      workers.forEach((listener, worker) =>
        worker.removeEventListener("statechange", listener),
      );
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", done);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  return (
    <>
      {offline && (
        <div className="notice install-notice" role="status">
          Offline · Prices and balances may be outdated. Reconnect before making
          decisions.
        </div>
      )}
      {update && (
        <button
          className="text-link"
          disabled={updating}
          onClick={() => {
            setUpdating(true);
            if (update.state === "activated" || update.state === "redundant") {
              location.reload();
              return;
            }
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => location.reload(),
              { once: true },
            );
            update.postMessage("ACTIVATE_UPDATE");
          }}
        >
          {updating ? "Updating…" : "Update app →"}
        </button>
      )}
      {!installed && !update && (
        <>
          <button
            className="text-link"
            onClick={async () => {
              if (prompt) {
                await prompt.prompt();
                if ((await prompt.userChoice).outcome === "accepted")
                  setInstalled(true);
                setPrompt(null);
              } else setHelp(!help);
            }}
          >
            Install app
          </button>
          {help && (
            <div className="notice install-notice" role="status">
              {ios
                ? "On iPhone: open this site in Safari, tap Share, then Add to Home Screen."
                : "Open your browser menu and choose Install app or Add to Home Screen. Installation support depends on your browser."}
            </div>
          )}
        </>
      )}
    </>
  );
}
