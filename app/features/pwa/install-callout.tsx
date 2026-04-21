import { DownloadIcon, ShareIcon } from "lucide-react";
import { startTransition, useState } from "react";

import { Button } from "~/components/atoms/button";

import { usePwaInstall } from "./install";

export function InstallAppCallout() {
  const {
    canPromptInstall,
    isInstalled,
    promptInstall,
    showBrowserInstructions,
    showIosInstructions,
  } = usePwaInstall();
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  if (isInstalled || (!canPromptInstall && !showBrowserInstructions && !showIosInstructions)) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-background/70 p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="font-medium text-sm tracking-tight">Install App</h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Launch lifting3 from your home screen with standalone chrome and faster repeat access.
        </p>
      </div>

      {canPromptInstall ? (
        <div className="mt-3 space-y-2">
          <Button
            className="w-full"
            onClick={() => {
              startTransition(() => {
                void promptInstall().then((outcome) => {
                  setInstallMessage(
                    outcome === "accepted"
                      ? "Install prompt accepted."
                      : "Install prompt dismissed.",
                  );
                });
              });
            }}
            size="sm"
            type="button"
          >
            <DownloadIcon aria-hidden className="size-4" />
            Install App
          </Button>
          {installMessage ? (
            <p className="text-muted-foreground text-xs leading-relaxed">{installMessage}</p>
          ) : null}
        </div>
      ) : null}

      {showIosInstructions ? (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs leading-relaxed">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
            <ShareIcon aria-hidden className="size-4" />
            Add to Home Screen
          </div>
          In Safari on iPhone or iPad, open the Share menu and choose{" "}
          <span className="font-medium text-foreground">Add to Home Screen</span>.
        </div>
      ) : null}

      {showBrowserInstructions && !canPromptInstall ? (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs leading-relaxed">
          Use your browser’s install action from the address bar or app menu. On Safari desktop, use{" "}
          <span className="font-medium text-foreground">Add to Dock</span>.
        </div>
      ) : null}
    </section>
  );
}
