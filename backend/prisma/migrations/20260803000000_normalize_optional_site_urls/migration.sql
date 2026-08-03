UPDATE sites
SET demo_url = NULL
WHERE demo_url IS NOT NULL AND btrim(demo_url) = '';

UPDATE sites
SET site_url = NULL
WHERE site_url IS NOT NULL AND btrim(site_url) = '';

UPDATE sites
SET preview_image_url = NULL
WHERE preview_image_url IS NOT NULL AND btrim(preview_image_url) = '';

UPDATE sites
SET demo_local_url = NULL
WHERE demo_local_url IS NOT NULL AND btrim(demo_local_url) = '';

UPDATE sites
SET external_demo_url = NULL
WHERE external_demo_url IS NOT NULL AND btrim(external_demo_url) = '';

UPDATE sites
SET original_demo_url = NULL
WHERE original_demo_url IS NOT NULL AND btrim(original_demo_url) = '';

ALTER TABLE sites
  ADD CONSTRAINT sites_demo_url_not_blank_check
  CHECK (demo_url IS NULL OR btrim(demo_url) <> '');

ALTER TABLE sites
  ADD CONSTRAINT sites_site_url_not_blank_check
  CHECK (site_url IS NULL OR btrim(site_url) <> '');

ALTER TABLE sites
  ADD CONSTRAINT sites_preview_image_url_not_blank_check
  CHECK (preview_image_url IS NULL OR btrim(preview_image_url) <> '');

ALTER TABLE sites
  ADD CONSTRAINT sites_demo_local_url_not_blank_check
  CHECK (demo_local_url IS NULL OR btrim(demo_local_url) <> '');

ALTER TABLE sites
  ADD CONSTRAINT sites_external_demo_url_not_blank_check
  CHECK (external_demo_url IS NULL OR btrim(external_demo_url) <> '');

ALTER TABLE sites
  ADD CONSTRAINT sites_original_demo_url_not_blank_check
  CHECK (original_demo_url IS NULL OR btrim(original_demo_url) <> '');
