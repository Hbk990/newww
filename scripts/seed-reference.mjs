/**
 * Seeds the reference data: categories, brands, device brands and device models.
 *
 * The source is the committed JSON in `seed/`, not the catalog CSV — derived
 * once from the export and checked in so this is reproducible without the
 * original file, and so the taxonomy fixes are visible in a diff rather than
 * buried in parsing code.
 *
 * Idempotent, and by default it will NOT overwrite rows that already exist.
 * These tables are curated in the admin: renaming a category or reordering the
 * sidebar is a decision someone made, and a re-run must not silently undo it.
 * Pass --force to update existing rows from the seed instead.
 *
 *   node --env-file-if-exists=.env scripts/seed-reference.mjs [--force]
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const force = process.argv.includes("--force");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../seed/${name}`, import.meta.url), "utf8"));

const { categories } = read("categories.json");
const { brands } = read("brands.json");
const { device_brands: deviceBrands, device_models: deviceModels } =
  read("devices.json");

const sql = postgres(url, { max: 1 });
const tally = { inserted: 0, kept: 0, updated: 0 };

/** `xmax = 0` is how Postgres tells an insert apart from an update in a RETURNING. */
function count(rows) {
  const row = rows[0];
  if (!row) tally.kept += 1;
  else if (row.inserted) tally.inserted += 1;
  else tally.updated += 1;
  return row;
}

try {
  await sql.begin(async (tx) => {
    // ---------------------------------------------------------- categories
    // Parents first: a child needs its parent's id, and the tree is two deep.
    const ids = new Map();

    for (const group of categories.filter((c) => c.parent === null)) {
      const rows = force
        ? await tx`insert into categories ${tx({ slug: group.slug, name: group.name, position: group.position })}
                   on conflict (slug) do update set name = excluded.name, position = excluded.position
                   returning id, (xmax = 0) as inserted`
        : await tx`insert into categories ${tx({ slug: group.slug, name: group.name, position: group.position })}
                   on conflict (slug) do nothing
                   returning id, (xmax = 0) as inserted`;
      const row = count(rows);
      ids.set(
        group.slug,
        row?.id ??
          (await tx`select id from categories where slug = ${group.slug}`)[0].id,
      );
    }

    for (const child of categories.filter((c) => c.parent !== null)) {
      const parentId = ids.get(child.parent);
      const values = {
        slug: child.slug,
        name: child.name,
        parent_id: parentId,
        position: child.position,
      };
      const rows = force
        ? await tx`insert into categories ${tx(values)}
                   on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id, position = excluded.position
                   returning id, (xmax = 0) as inserted`
        : await tx`insert into categories ${tx(values)}
                   on conflict (slug) do nothing
                   returning id, (xmax = 0) as inserted`;
      count(rows);
    }

    // -------------------------------------------------------------- brands
    for (const [index, brand] of brands.entries()) {
      const values = { slug: brand.slug, name: brand.name, position: index };
      const rows = force
        ? await tx`insert into brands ${tx(values)}
                   on conflict (slug) do update set name = excluded.name
                   returning id, (xmax = 0) as inserted`
        : await tx`insert into brands ${tx(values)}
                   on conflict (slug) do nothing
                   returning id, (xmax = 0) as inserted`;
      count(rows);
    }

    // ------------------------------------------------------------ devices
    const brandIds = new Map();
    for (const brand of deviceBrands) {
      const values = { slug: brand.slug, name: brand.name, position: brand.position };
      const rows = force
        ? await tx`insert into device_brands ${tx(values)}
                   on conflict (slug) do update set name = excluded.name, position = excluded.position
                   returning id, (xmax = 0) as inserted`
        : await tx`insert into device_brands ${tx(values)}
                   on conflict (slug) do nothing
                   returning id, (xmax = 0) as inserted`;
      const row = count(rows);
      brandIds.set(
        brand.name,
        row?.id ??
          (await tx`select id from device_brands where slug = ${brand.slug}`)[0].id,
      );
    }

    for (const [index, model] of deviceModels.entries()) {
      const values = {
        device_brand_id: brandIds.get(model.brand),
        slug: model.slug,
        name: model.name,
        family: model.family,
        position: index,
      };
      const rows = force
        ? await tx`insert into device_models ${tx(values)}
                   on conflict (slug) do update set name = excluded.name, family = excluded.family, device_brand_id = excluded.device_brand_id
                   returning id, (xmax = 0) as inserted`
        : await tx`insert into device_models ${tx(values)}
                   on conflict (slug) do nothing
                   returning id, (xmax = 0) as inserted`;
      count(rows);
    }
  });

  const groups = categories.filter((c) => c.parent === null).length;
  console.log(
    [
      "Reference data seeded.",
      `  categories     ${groups} groups, ${categories.length - groups} children`,
      `  brands         ${brands.length}`,
      `  device brands  ${deviceBrands.length}`,
      `  device models  ${deviceModels.length}`,
      "",
      `  ${tally.inserted} inserted, ${tally.updated} updated, ${tally.kept} left alone`,
      tally.kept > 0 && !force
        ? "  (existing rows are never overwritten — pass --force to update them)"
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
} catch (error) {
  console.error("\nSeed failed.\n");
  console.error(error?.message ?? error);
  for (const key of ["code", "detail", "hint", "where", "query"]) {
    if (error?.[key]) console.error(`  ${key}: ${error[key]}`);
  }
  process.exitCode = 1;
} finally {
  await sql.end();
}
