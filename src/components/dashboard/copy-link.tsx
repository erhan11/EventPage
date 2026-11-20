"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";

/** One-tap copy of the public event URL — the thing organizers do most. */
export function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${location.origin}/e/${slug}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {}
      }}
    >
      {copied ? <Check size={15} className="text-ok" /> : <Link2 size={15} />} {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
