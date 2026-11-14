-- Storage map (Nov 2026, LabHive only). Run in the LabHive project.
-- Idempotent: safe to run again.
--
-- A floor plan is now a DRAWN layout (rooms + spots), like ICT-Lab's maps,
-- instead of a photo with zones. Spots are racks with shelves (A–Z, top down)
-- and places (A1, A2…), a pallet or a floor area. One place holds many
-- materials (one storage_locations row each) and has one owner: whoever
-- stored there first. Coordinates are percent of the map (0–100), so a
-- layout draws the same at any size; `aspect` is the map's width / height
-- (NULL = take it from the background photo).
--
--   rooms: [{ id, name, x, y, w, h }]
--   spots: [{ id, room_id, name, x, y, type: 'floor'|'pallet'|'racks',
--             rackNames, shelvesPerRack, placesPerShelf }]

CREATE TABLE IF NOT EXISTS storage_layouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  solo_owner_id   uuid,
  name            text NOT NULL,
  rooms           jsonb NOT NULL DEFAULT '[]'::jsonb,
  spots           jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url       text,
  aspect          numeric DEFAULT 1.6667,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_layouts_owner CHECK (organization_id IS NOT NULL OR solo_owner_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS storage_layouts_org_idx ON storage_layouts (organization_id);

-- Everyone in the organization sees the map; only its admins and lab
-- managers change it (a solo user owns their own).
ALTER TABLE storage_layouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_layouts_select ON storage_layouts;
CREATE POLICY storage_layouts_select ON storage_layouts FOR SELECT TO authenticated USING (
  is_super_admin()
  OR organization_id IN (SELECT my_org_ids())
  OR (organization_id IS NULL AND solo_owner_id = my_solo_id())
);
DROP POLICY IF EXISTS storage_layouts_manage ON storage_layouts;
CREATE POLICY storage_layouts_manage ON storage_layouts FOR ALL TO authenticated USING (
  is_super_admin()
  OR organization_id IN (SELECT my_managed_org_ids())
  OR (organization_id IS NULL AND solo_owner_id = my_solo_id())
) WITH CHECK (
  is_super_admin()
  OR organization_id IN (SELECT my_managed_org_ids())
  OR (organization_id IS NULL AND solo_owner_id = my_solo_id())
);
-- New tables get no API grants by default (Supabase, Oct 30 2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_layouts TO authenticated, service_role;

-- Who owns a place: the users row that stored there first
ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS occupied_by_id uuid;

-- Existing photo floor plans become layouts: the photo stays as the map's
-- background, each zone becomes a room with one floor spot of the same id,
-- so materials already stored in a zone are still found. Only for
-- organizations that still exist (floor_plans has no foreign key: plans of
-- deleted organizations are left behind) and have no layout yet.
INSERT INTO storage_layouts (organization_id, name, image_url, aspect, rooms, spots, sort_order)
SELECT fp.organization_id, fp.name, fp.image_url, NULL,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', 'room_' || (z->>'id'), 'name', z->>'label',
    'x', (z->>'x')::numeric, 'y', (z->>'y')::numeric, 'w', (z->>'w')::numeric, 'h', (z->>'h')::numeric))
    FROM jsonb_array_elements(COALESCE(fp.zones, '[]'::jsonb)) z), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', z->>'id', 'room_id', 'room_' || (z->>'id'), 'name', z->>'label', 'type', 'floor',
    'x', (z->>'x')::numeric + (z->>'w')::numeric / 2, 'y', (z->>'y')::numeric + (z->>'h')::numeric / 2))
    FROM jsonb_array_elements(COALESCE(fp.zones, '[]'::jsonb)) z), '[]'::jsonb),
  row_number() OVER (PARTITION BY fp.organization_id ORDER BY fp.created_at)
FROM floor_plans fp
WHERE fp.organization_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = fp.organization_id)
  AND NOT EXISTS (SELECT 1 FROM storage_layouts l WHERE l.organization_id = fp.organization_id);

NOTIFY pgrst, 'reload schema';

-- Check: the table, its two policies, and how many layouts each organization has
SELECT o.name AS organization, count(l.id) AS layouts,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'storage_layouts') AS policies,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'storage_locations' AND column_name = 'occupied_by_id') AS owner_column
FROM organizations o LEFT JOIN storage_layouts l ON l.organization_id = o.id
GROUP BY o.name ORDER BY o.name;
