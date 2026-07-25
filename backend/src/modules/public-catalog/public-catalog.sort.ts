import type { Prisma } from "../../generated/prisma/client.js";
import type { SiteSort } from "./public-catalog.types.js";

export function siteOrderBy(sort: SiteSort): Prisma.SiteOrderByWithRelationInput[] {
  switch (sort) {
    case "sortOrder":
      return [
        { sortOrder: "asc" },
        { createdAt: "desc" },
        { slug: "asc" }
      ];
    case "newest":
      return [
        { createdAt: "desc" },
        { slug: "asc" }
      ];
    case "popular":
      return [
        { featured: "desc" },
        { views: "desc" },
        { sortOrder: "asc" },
        { createdAt: "desc" },
        { slug: "asc" }
      ];
    case "title":
      return [
        { title: "asc" },
        { slug: "asc" }
      ];
  }
}
