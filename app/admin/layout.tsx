import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { MobileNav } from "@/components/admin/mobile-nav";
import { Sidebar } from "@/components/admin/sidebar";
import { ToastProvider } from "@/components/admin/toast";
import { TopBar } from "@/components/admin/top-bar";
import { NAV, NAV_FOOTER, QUICK_CREATE } from "@/lib/admin/nav";
import { signOut } from "@/lib/auth/actions";
import { requireStaff } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

/**
 * The admin gate and the shell around every admin page.
 *
 * Access is enforced here rather than per page, so a new screen is protected by
 * existing in this tree. Not middleware: the check reads the user's current
 * role and status from the database, so suspending or demoting someone takes
 * effect on their next request instead of whenever their cookie expires.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireStaff();

  /**
   * The nav is filtered by permission even though the decision was to show
   * everything to all staff. Nothing here is hidden from a `staff` account
   * except Staff and Audit log, which are admin-only — and a link that
   * redirects away is worse than no link.
   */
  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(user, item.permission)),
  })).filter((section) => section.items.length > 0);

  const footer = NAV_FOOTER.filter((item) => can(user, item.permission));
  const createItems = QUICK_CREATE.filter((item) =>
    can(user, item.permission),
  ).map(({ label, href }) => ({ label, href }));

  const [unread] = await db
    .select({ n: count() })
    .from(notifications)
    .where(eq(notifications.status, "queued"));

  return (
    <ToastProvider>
      <div className="flex min-h-svh">
        <Sidebar sections={sections} footer={footer} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            createItems={createItems}
            unread={unread?.n ?? 0}
            name={user.username ?? user.name ?? user.email}
            role={user.role}
            signOut={signOut}
          />
          {/* Bottom padding clears the mobile nav bar. */}
          <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10">
            <Breadcrumbs />
            {children}
          </main>
        </div>
        <MobileNav sections={sections} footer={footer} />
      </div>
    </ToastProvider>
  );
}
