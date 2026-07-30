import { describe, expect, it } from "vitest";

import { createAdminSiteListWhere } from "../src/modules/admin/sites/site.repository.js";

describe("admin site repository query helpers", () => {
  it("includes slug in admin site search for post-network-failure verification", () => {
    expect(createAdminSiteListWhere({
      deleted: "without",
      direction: "desc",
      limit: 20,
      page: 1,
      search: "magazin-odezhdy-test",
      sort: "updatedAt"
    }, true)).toMatchObject({
      deletedAt: null,
      OR: [
        { title: { contains: "magazin-odezhdy-test", mode: "insensitive" } },
        { shortDescription: { contains: "magazin-odezhdy-test", mode: "insensitive" } },
        { slug: { contains: "magazin-odezhdy-test", mode: "insensitive" } }
      ]
    });
  });
});
