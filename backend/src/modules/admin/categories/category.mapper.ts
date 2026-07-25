import type {
  AdminCategoryDetail,
  AdminCategoryRecord
} from "./category.types.js";

export function mapAdminCategoryDetail(
  record: AdminCategoryRecord,
  role: "admin" | "editor"
): AdminCategoryDetail {
  const common = {
    description: record.description,
    id: record.id,
    ...(record.siteCount === undefined ? {} : { siteCount: record.siteCount }),
    slug: record.slug,
    sortOrder: record.sortOrder,
    title: record.title
  };

  if (role === "admin") {
    return {
      ...common,
      active: record.active,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  return common;
}

export function mapAdminCategoryList(
  records: readonly AdminCategoryRecord[],
  role: "admin" | "editor"
): AdminCategoryDetail[] {
  return records.map((record) => mapAdminCategoryDetail(record, role));
}
