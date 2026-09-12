import type { Route } from "next";

import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  label: string;
  href: Route;
  permission: Permission;
  /** Shown in the phone's bottom bar. Four at most — a fifth stops being a tap target. */
  mobile?: boolean;
  /** Inline SVG path. A dozen glyphs is not worth an icon dependency. */
  icon: string;
};

export type NavSection = { heading: string; items: NavItem[] };

/**
 * The sidebar, grouped under headings.
 *
 * Only destinations that exist appear here — a menu item leading nowhere
 * teaches people to stop trusting the menu. `href` is typed as `Route`, so a
 * link to a page that does not exist fails the build rather than shipping.
 */
export const NAV: NavSection[] = [
  {
    heading: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        permission: "orders.view",
        icon: "M3 12h6v9H3zM10.5 3h3v18h-3zM15 8h6v13h-6z",
      },
    ],
  },
  {
    heading: "Sales",
    items: [
      {
        label: "Orders",
        href: "/admin/orders",
        permission: "orders.view",
        mobile: true,
        icon: "M4 6h16l-1.5 13H5.5zM9 6V4a3 3 0 0 1 6 0v2",
      },
      {
        label: "Customers",
        href: "/admin/customers",
        permission: "customers.view",
        icon: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0",
      },
      {
        label: "Reviews",
        href: "/admin/reviews",
        permission: "reviews.moderate",
        icon: "M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z",
      },
    ],
  },
  {
    heading: "Catalog",
    items: [
      {
        label: "Products",
        href: "/admin/products",
        permission: "products.view",
        mobile: true,
        icon: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
      },
      {
        label: "Categories",
        href: "/admin/categories",
        permission: "products.edit",
        icon: "M4 5h7l2 3h7v11H4z",
      },
      {
        label: "Brands",
        href: "/admin/brands",
        permission: "products.edit",
        icon: "M4 4h16v6a8 8 0 0 1-16 0zM8 20h8",
      },
      {
        label: "Attributes",
        href: "/admin/attributes",
        permission: "products.edit",
        icon: "M4 6h16M4 12h10M4 18h6",
      },
      {
        label: "Devices",
        href: "/admin/devices",
        permission: "products.edit",
        icon: "M7 3h10v18H7zM10 19h4",
      },
      {
        label: "Promotions",
        href: "/admin/promotions",
        permission: "promotions.manage",
        icon: "M4 12l8-8 8 8-8 8zM12 8v4l3 2",
      },
    ],
  },
  {
    heading: "Inventory",
    items: [
      {
        label: "Stock",
        href: "/admin/stock",
        permission: "inventory.view",
        mobile: true,
        icon: "M3 8h18v12H3zM3 8l2-4h14l2 4M9 12h6",
      },
      {
        label: "Stock counts",
        href: "/admin/stock-counts",
        permission: "inventory.count",
        icon: "M8 4h8v4H8zM5 8h14v12H5zM9 13h6M9 16h6",
      },
    ],
  },
  {
    heading: "System",
    items: [
      {
        label: "Delivery zones",
        href: "/admin/shipping",
        permission: "settings.view",
        icon: "M3 7h11v8H3zM14 10h4l3 3v2h-7zM6.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M17.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3",
      },
      {
        label: "Staff",
        href: "/admin/staff",
        permission: "users.manage",
        icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2 20a7 7 0 0 1 14 0M17 8h5M19.5 5.5v5",
      },
      {
        label: "Audit log",
        href: "/admin/audit",
        permission: "audit.view",
        icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4",
      },
    ],
  },
];

/**
 * Pinned to the bottom of the sidebar rather than inside a section: used
 * rarely, and must always be in the same place.
 */
export const NAV_FOOTER: NavItem[] = [
  {
    label: "Settings",
    href: "/admin/settings",
    permission: "settings.view",
    icon: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.1 15H2a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.1V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z",
  },
];

/** Everything that exists and gets created often enough to want one click. */
export const QUICK_CREATE: { label: string; href: Route; permission: Permission }[] = [
  { label: "Product", href: "/admin/products/new", permission: "products.create" },
  { label: "Order", href: "/admin/orders/new", permission: "orders.create" },
  { label: "Customer", href: "/admin/customers/new", permission: "customers.view" },
  { label: "Stock adjustment", href: "/admin/stock/adjust", permission: "inventory.adjust" },
];
