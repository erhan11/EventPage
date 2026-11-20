"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/primitives";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-svh place-items-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center text-center">
        <p className="label-mono text-muted">Something skipped</p>
        <h1 className="display-serif mt-3 text-6xl italic">The needle jumped.</h1>
        <p className="mt-5 leading-relaxed text-muted">
          An unexpected error interrupted the page. Nothing was charged by this error — try again, and if it keeps
          happening come back in a minute.
        </p>
        {error.digest && <p className="label-mono mt-3 text-[10px] text-muted">Ref {error.digest}</p>}
        <div className="mt-8 flex gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className="inline-flex h-10 items-center rounded-full px-4 text-sm text-muted hover:bg-surface hover:text-fg">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
