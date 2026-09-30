"use client";

export default function BrowserPane({
  liveViewUrl,
  screenshotUrl,
  status,
}: {
  liveViewUrl: string | null;
  screenshotUrl?: string | null;
  status?: string | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-base-700 px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">
        Live browser
      </div>
      <div className="flex flex-1 items-center justify-center bg-black">
        {screenshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL screenshot, next/image cannot optimize it
          <img
            src={screenshotUrl}
            alt="Current browser view"
            className="h-full w-full object-contain"
          />
        ) : liveViewUrl ? (
          <iframe
            src={liveViewUrl}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin"
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
            {status ??
              "The browser pane opens here once the assistant starts a session, or as soon as this chat's browser session is ready."}
          </div>
        )}
      </div>
    </div>
  );
}
