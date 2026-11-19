import { LogOut, ScanLine } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getManagedOrgId } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  if (!(await getManagedOrgId(user.id))) redirect("/scan");
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
              <Link href="/dashboard" className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-fg">
                Events
              </Link>
              <Link href="/scan" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-fg">
                <ScanLine size={14} /> Door
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden text-sm text-muted md:inline">{user.name}</span>
            <form action={signOut}>
              <button className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg" aria-label="Sign out">
                <LogOut size={15} />
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
