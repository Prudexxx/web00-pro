DO $$
DECLARE
  canonical_slugs text[] := ARRAY[
    'site-custom',
    'mebel',
    'odezhda',
    'doma-bani',
    'medicina',
    'narko-medicine',
    'uslugi',
    'cleaning',
    'advokat',
    'krovlya',
    'digital-projects',
    'ruberoid-roof',
    'rental-house',
    'massage',
    'drova'
  ];
  updated_count integer;
BEGIN
  WITH promoted AS (
    UPDATE "sites"
    SET
      "status" = 'published',
      "published_at" = CURRENT_TIMESTAMP
    WHERE "slug" = ANY(canonical_slugs)
      AND "status" = 'draft'
      AND "published_at" IS NULL
      AND "active" = true
      AND "deleted_at" IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO updated_count
  FROM promoted;

  IF updated_count NOT IN (0, 15) THEN
    RAISE EXCEPTION 'Expected to publish either 0 or 15 canonical sites, published %.', updated_count;
  END IF;
END $$;
