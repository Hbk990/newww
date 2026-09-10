import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { brands, categories } from "./taxonomy";
import { collections } from "./collections";
import { deviceModels } from "./devices";

export const navMenus = pgTable("nav_menus", {
  id: uuid().primaryKey().defaultRandom(),
  // 'main', 'footer', 'mobile'
  handle: text().notNull().unique(),
  name: text().notNull(),
});

/**
 * Menus are curated, not a mirror of the category tree. With 9 groups and 48
 * categories — most of them empty at launch — a mega-menu generated from the
 * tree would be a wall of dead ends. This gives it its own ordering, promoted
 * items and imagery.
 *
 * An item points at exactly one destination, enforced by a check rather than by
 * convention: a nav item with two targets has no defined behaviour, and one
 * with none is an invisible broken link.
 */
export const navItems = pgTable(
  "nav_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    menuId: uuid()
      .notNull()
      .references(() => navMenus.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => navItems.id, {
      onDelete: "cascade",
    }),
    label: text().notNull(),
    position: integer().notNull().default(0),
    // A highlighted column in the mega-menu.
    isFeatured: boolean().notNull().default(false),
    imageUrl: text(),

    // Exactly one of the following.
    url: text(),
    categoryId: uuid().references(() => categories.id, { onDelete: "cascade" }),
    collectionId: uuid().references(() => collections.id, {
      onDelete: "cascade",
    }),
    brandId: uuid().references(() => brands.id, { onDelete: "cascade" }),
    deviceModelId: uuid().references(() => deviceModels.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    index("nav_items_menu_parent_position_idx").on(
      t.menuId,
      t.parentId,
      t.position,
    ),
    check(
      "nav_items_exactly_one_destination",
      sql`num_nonnulls(${t.url}, ${t.categoryId}, ${t.collectionId}, ${t.brandId}, ${t.deviceModelId}) = 1`,
    ),
  ],
);
