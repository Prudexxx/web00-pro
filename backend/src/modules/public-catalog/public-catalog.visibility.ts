import type { Prisma } from "../../generated/prisma/client.js";

export const PUBLIC_SITE_VISIBILITY_WHERE = Object.freeze({
  active: true,
  deletedAt: null,
  status: "published"
} satisfies Prisma.SiteWhereInput);

export const PUBLIC_CATEGORY_VISIBILITY_WHERE = Object.freeze({
  active: true
} satisfies Prisma.CategoryWhereInput);

export function publicSiteVisibilityWhere(): Prisma.SiteWhereInput {
  return { ...PUBLIC_SITE_VISIBILITY_WHERE };
}

export function publicCategoryVisibilityWhere(): Prisma.CategoryWhereInput {
  return { ...PUBLIC_CATEGORY_VISIBILITY_WHERE };
}
