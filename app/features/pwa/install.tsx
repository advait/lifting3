import { useEffect, useEffectEvent, useState } from "react";

interface BeforeInstallPromptChoice {
  readonly outcome: "accepted" | "dismissed";
  readonly platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<BeforeInstallPromptChoice>;
  userChoice: Promise<BeforeInstallPromptChoice>;
}

interface NavigatorWithStandalone extends Navigator {
  readonly standalone?: boolean;
}

const IOS_DEVICE_PATTERN = /iPad|iPhone|iPod/;
const IOS_MAC_PATTERN = /Mac/;

function getBrowserNavigator() {
  if (typeof navigator === "undefined") {
    return null;
  }

  return navigator as NavigatorWithStandalone;
}

function isStandaloneDisplayMode(browserNavigator: NavigatorWithStandalone) {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches || browserNavigator.standalone === true
  );
}

function isIosInstallCandidate(browserNavigator: NavigatorWithStandalone) {
  return (
    IOS_DEVICE_PATTERN.test(browserNavigator.userAgent) ||
    (IOS_MAC_PATTERN.test(browserNavigator.platform) && browserNavigator.maxTouchPoints > 1)
  );
}

export function usePwaRegistration() {
  const registerServiceWorker = useEffectEvent(async () => {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch {
      return;
    }
  });

  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) {
      return;
    }

    void registerServiceWorker();
  }, [registerServiceWorker]);
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showBrowserInstructions, setShowBrowserInstructions] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  const syncInstallState = useEffectEvent(() => {
    const browserNavigator = getBrowserNavigator();

    if (!browserNavigator) {
      return;
    }

    const installed = isStandaloneDisplayMode(browserNavigator);
    const iosInstallCandidate = isIosInstallCandidate(browserNavigator);

    setIsInstalled(installed);
    setShowBrowserInstructions(!installed && !iosInstallCandidate);
    setShowIosInstructions(!installed && iosInstallCandidate);
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    syncInstallState();

    const standaloneMediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleStandaloneChange = () => {
      syncInstallState();
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;

      installEvent.preventDefault();
      setInstallPrompt(installEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      syncInstallState();
    };

    standaloneMediaQuery.addEventListener("change", handleStandaloneChange);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      standaloneMediaQuery.removeEventListener("change", handleStandaloneChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [syncInstallState]);

  const promptInstall = useEffectEvent(async () => {
    if (!installPrompt) {
      return "dismissed" as const;
    }

    const result = await installPrompt.prompt();

    setInstallPrompt(null);

    return result.outcome;
  });

  return {
    canPromptInstall: !isInstalled && installPrompt !== null,
    isInstalled,
    promptInstall,
    showBrowserInstructions,
    showIosInstructions,
  };
}
