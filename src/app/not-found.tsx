import type { Metadata } from "next";
import { Logo } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center text-center">
        <Logo />
        <p className="label-mono mt-14 text-muted">404</p>
        <h1 className="display-serif mt-3 text-6xl italic">Lost in the dark.</h1>
        <p className="mt-5 leading-relaxed text-muted">
          This page doesn&apos;t exist — the event may have been unpublished, or the link has a typo. Check the link the
          organizer shared with you.
        </p>
        <ButtonLink href="/" className="mt-8">
          Back to the entrance
        </ButtonLink>
      </div>
    </main>
  );
}
