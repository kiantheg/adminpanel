"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ADMIN_NAV_GROUPS, ADMIN_RESOURCES } from "@/lib/admin-resources";
import { useAdmin } from "@/components/admin/admin-provider";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { error, isSuperAdmin, loading, me, signOut } = useAdmin();

  if (loading) {
    return (
      <main className="adminGate">
        <section className="gateCard">
          <p className="eyebrow">Admin Panel</p>
          <h1>Loading session</h1>
          <p className="supporting">Checking Google auth and superadmin access.</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="adminGate">
        <section className="gateCard">
          <p className="eyebrow">Session Error</p>
          <h1>Unable to load admin access</h1>
          <p className="errorBanner">{error}</p>
          <button type="button" className="primaryButton" onClick={() => void signOut()}>
            Back to login
          </button>
        </section>
      </main>
    );
  }

  if (!isSuperAdmin) {
    return (
      <main className="adminGate">
        <section className="gateCard">
          <p className="eyebrow">Access Restricted</p>
          <h1>Superadmin required</h1>
          <p className="supporting">Signed in as {me?.email ?? me?.id ?? "unknown user"}.</p>
          <p className="errorBanner">This account does not have `is_superadmin = true` in `profiles`.</p>
          <button type="button" className="primaryButton" onClick={() => void signOut()}>
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="adminApp">
      <aside className="sidebar">
        <div className="sidebarBrand">
          <p className="eyebrow">Humor Project</p>
          <h1>Admin Console</h1>
          <p className="sidebarSupport">Internal tools for database operations, moderation, and image management.</p>
        </div>

        <div className="sidebarScroll">
          <nav className="sidebarNav" aria-label="Primary">
            <Link href="/" className={isActive(pathname, "/") && pathname === "/" ? "navLink navLinkActive" : "navLink"}>
              Dashboard
            </Link>
            <Link href="/profiles" className={isActive(pathname, "/profiles") ? "navLink navLinkActive" : "navLink"}>
              Profiles
            </Link>
            <Link href="/images" className={isActive(pathname, "/images") ? "navLink navLinkActive" : "navLink"}>
              Image Management
            </Link>
          <Link href="/captions" className={isActive(pathname, "/captions") ? "navLink navLinkActive" : "navLink"}>
            Captions
          </Link>
          <Link
            href="/caption-statistics"
            className={isActive(pathname, "/caption-statistics") ? "navLink navLinkActive" : "navLink"}
          >
            Caption Statistics
          </Link>
        </nav>

          <div className="sidebarSections">
            {ADMIN_NAV_GROUPS.map((group) => {
              const groupResources = ADMIN_RESOURCES.filter((resource) => resource.navGroup === group.key);
              return (
                <section key={group.key} className="sidebarGroup">
                  <p className="sidebarGroupLabel">{group.label}</p>
                  <div className="sidebarGroupLinks">
                    {groupResources.map((resource) => {
                      const href = `/tables/${resource.key}`;
                      return (
                        <Link
                          key={resource.key}
                          href={href}
                          className={isActive(pathname, href) ? "navLink navLinkActive" : "navLink"}
                        >
                          {resource.label}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="sidebarFooter">
          <div>
            <p className="sidebarIdentity">{me?.email ?? "Unknown user"}</p>
            <p className="sidebarSupport">Superadmin session</p>
          </div>
          <button type="button" className="sidebarSignOutButton" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="contentShell">{children}</div>
    </div>
  );
}
