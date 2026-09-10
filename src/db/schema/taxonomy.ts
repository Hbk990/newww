import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Category tree. Two levels today — 9 groups over 48 categories from the
 * catalog export — but `parentId` is self-referencing so the depth is not
 * capped there.
 *
 * `onDelete: "restrict"` rather than cascade: deleting a group must not
 * silently take its children with it.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    parentId: uuid().references((): AnyPgColumn => categories.id, {
      onDelete: "restrict",
    }),
    slug: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    imageUrl: text(),
    position: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("categories_parent_position_idx").on(t.parentId, t.position)],
);

/**
 * Brands are first-class, with their own landing pages.
 *
 * The export used `Razer` and `HyperX` as *categories* — 57 products filed by
 * brand rather than by what they are. Those become brand pages instead, and the
 * products get refiled under Headphones, Microphones and Keyboard & Mouse.
 */
export const brands = pgTable("brands", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  logoUrl: text(),
  description: text(),
  isFeatured: boolean().notNull().default(false),
  position: integer().notNull().default(0),
});
