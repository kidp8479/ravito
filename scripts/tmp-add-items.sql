BEGIN;

WITH target_household AS (
  SELECT h.id FROM "Household" h
  JOIN "HouseholdMember" hm ON hm."householdId" = h.id
  JOIN "User" u ON u.id = hm."userId"
  WHERE u.email = 'kidp8479@gmail.com'
  ORDER BY hm."joinedAt" ASC
  LIMIT 1
),
items(name, qty, unit, category) AS (VALUES
  ('Tomates cerises', 1, 'boîte', 'FRUITS_AND_VEGETABLES'),
  ('Avocat', 2, 'pièce', 'FRUITS_AND_VEGETABLES'),
  ('Farine de seigle', 1, 'paquet', 'BAKING'),
  ('Farine de sarrasin', 1, 'paquet', 'BAKING'),
  ('Yaourt grec', 1, 'kg', 'DAIRY'),
  ('Gaspacho', 1, 'L', 'FRUITS_AND_VEGETABLES'),
  ('Emmental', 1, 'paquet', 'DAIRY'),
  ('Halloumi', 1, 'paquet', 'DAIRY'),
  ('Lait de soja', 1, 'L', 'BEVERAGES'),
  ('Pépites de chocolat', 1, 'paquet', 'BAKING')
),
inserted_products AS (
  INSERT INTO "Product" (id, "householdId", name, category, "defaultUnit", "createdAt")
  SELECT gen_random_uuid()::text, target_household.id, items.name,
         items.category::"ProductCategory", NULL, CURRENT_TIMESTAMP
  FROM items, target_household
  RETURNING id, name
)
INSERT INTO "InventoryItem" (id, "householdId", "productId", quantity, unit, "updatedAt")
SELECT gen_random_uuid()::text, target_household.id, inserted_products.id, items.qty, items.unit, CURRENT_TIMESTAMP
FROM inserted_products
JOIN items ON items.name = inserted_products.name
CROSS JOIN target_household;

COMMIT;
