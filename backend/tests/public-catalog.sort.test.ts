import { describe, expect, it } from "vitest";
import { siteOrderBy } from "../src/modules/public-catalog/public-catalog.sort.js";

describe("public catalog site sort mapping", () => {
  it("maps sortOrder to the approved stable order", () => {
    expect(siteOrderBy("sortOrder")).toEqual([
      { sortOrder: "asc" },
      { createdAt: "desc" },
      { slug: "asc" }
    ]);
  });

  it("maps newest to the approved stable order", () => {
    expect(siteOrderBy("newest")).toEqual([
      { createdAt: "desc" },
      { slug: "asc" }
    ]);
  });

  it("maps popular to the approved stable order", () => {
    expect(siteOrderBy("popular")).toEqual([
      { featured: "desc" },
      { views: "desc" },
      { sortOrder: "asc" },
      { createdAt: "desc" },
      { slug: "asc" }
    ]);
  });

  it("maps title to the approved stable order", () => {
    expect(siteOrderBy("title")).toEqual([
      { title: "asc" },
      { slug: "asc" }
    ]);
  });
});
