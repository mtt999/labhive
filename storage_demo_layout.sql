-- Demo Lab storage map (Nov 2026, LabHive only). Run AFTER
-- storage_layouts_setup.sql, in the LabHive project. Safe to run again:
-- it rebuilds the Demo Lab layout and re-files the demo materials.
--
-- Draws Demo Lab as an asphalt lab (Binder Lab, Mix Lab, Cold Room,
-- Aggregate Prep, Core Storage, Loading Area) and stores every Demo Lab
-- material on a shelf, place or pallet: binders on the Binder Rack (aged
-- residues in the fridge), plant mixes on Mix Shelf M1, raw / RAP aggregate
-- on the bays with their sieve fractions on Sieve Shelf S1, cores on Core
-- Rack C1. Each project gets its own places, owned by its creator.

DO $$
DECLARE
  org uuid := 'a4345d66-42c9-471d-a232-853ebad74bdb';
  lay uuid;
BEGIN
  SELECT id INTO lay FROM storage_layouts WHERE organization_id = org AND name = 'Main Floor';
  IF lay IS NULL THEN
    INSERT INTO storage_layouts (organization_id, name, aspect, sort_order) VALUES (org, 'Main Floor', 1.9048, 0) RETURNING id INTO lay;
  END IF;

  UPDATE storage_layouts SET image_url = NULL, aspect = 1.9048, updated_at = now(),
    rooms = '[
      {"id":"room_binder","name":"Binder Lab","x":2.5,"y":4.76,"w":31.25,"h":40.48},
      {"id":"room_mix","name":"Mix Lab","x":35,"y":4.76,"w":37.5,"h":40.48},
      {"id":"room_cold","name":"Cold Room","x":73.75,"y":4.76,"w":23.75,"h":26.19},
      {"id":"room_agg","name":"Aggregate Prep","x":2.5,"y":47.62,"w":41.25,"h":47.62},
      {"id":"room_core","name":"Core Storage","x":45,"y":47.62,"w":27.5,"h":47.62},
      {"id":"room_load","name":"Loading Area","x":73.75,"y":33.33,"w":23.75,"h":61.9}
    ]'::jsonb,
    spots = '[
      {"id":"spot_binder","room_id":"room_binder","name":"Binder Rack","x":18.1,"y":24,"type":"racks","rackNames":["R1","R2"],"shelvesPerRack":4,"placesPerShelf":2},
      {"id":"spot_solvent","room_id":"room_binder","name":"Solvent Cabinet","x":18.1,"y":37,"type":"floor"},
      {"id":"spot_mix","room_id":"room_mix","name":"Mix Shelf M1","x":53.75,"y":26,"type":"racks","rackNames":["R1","R2","R3"],"shelvesPerRack":4,"placesPerShelf":2},
      {"id":"spot_fridge","room_id":"room_cold","name":"Fridge F1","x":85.6,"y":19,"type":"racks","rackNames":["Main"],"shelvesPerRack":3,"placesPerShelf":2},
      {"id":"spot_bay1","room_id":"room_agg","name":"Aggregate Bay 1","x":13.75,"y":66,"type":"pallet"},
      {"id":"spot_bay2","room_id":"room_agg","name":"Aggregate Bay 2 (RAP)","x":32.75,"y":66,"type":"pallet"},
      {"id":"spot_sieve","room_id":"room_agg","name":"Sieve Shelf S1","x":23,"y":84,"type":"racks","rackNames":["R1","R2"],"shelvesPerRack":4,"placesPerShelf":2},
      {"id":"spot_core","room_id":"room_core","name":"Core Rack C1","x":58.75,"y":70,"type":"racks","rackNames":["R1","R2"],"shelvesPerRack":5,"placesPerShelf":1},
      {"id":"spot_drum","room_id":"room_load","name":"Drum Area","x":85.6,"y":62,"type":"floor"}
    ]'::jsonb
  WHERE id = lay;

  -- Every Demo Lab material: its project, depth below its parent folder, and
  -- the place it goes to
  CREATE TEMP TABLE demo_place ON COMMIT DROP AS
  WITH RECURSIVE tree AS (
    SELECT m.id, m.project_id, m.material_type, m.agg_raw_or_rap, 0 AS depth
    FROM project_materials m JOIN projects p ON p.id = m.project_id
    WHERE p.organization_id = org AND m.parent_material_id IS NULL
    UNION ALL
    SELECT c.id, c.project_id, c.material_type, c.agg_raw_or_rap, t.depth + 1
    FROM project_materials c JOIN tree t ON c.parent_material_id = t.id
  ), k AS (
    SELECT t.*, p.name AS project_name, COALESCE(p.created_by, 'Demo Manager') AS owner, m.created_at,
      CASE p.cfop WHEN 'DEMO-1001' THEN 1 WHEN 'DEMO-1002' THEN 2 WHEN 'DEMO-1003' THEN 3 WHEN 'DEMO-1004' THEN 4 WHEN 'DEMO-1005' THEN 5 ELSE 0 END AS k
    FROM tree t JOIN projects p ON p.id = t.project_id JOIN project_materials m ON m.id = t.id
  )
  SELECT k.*,
    CASE
      WHEN material_type = 'asphalt_binder' AND depth >= 2 THEN 'spot_fridge-R1-S' || (CASE k WHEN 1 THEN 1 WHEN 3 THEN 2 ELSE 3 END) || '-P' || (CASE WHEN depth >= 3 THEN 2 ELSE 1 END)
      WHEN material_type = 'asphalt_binder' THEN 'spot_binder-R' || (CASE k WHEN 1 THEN 1 ELSE 2 END) || '-S' || (CASE k WHEN 1 THEN 1 + depth WHEN 3 THEN 1 ELSE 3 END) || '-P' || (CASE WHEN k = 1 OR depth = 0 THEN 1 ELSE 2 END)
      WHEN material_type = 'plant_mix' THEN 'spot_mix-R' || (CASE k WHEN 2 THEN 1 WHEN 3 THEN 2 ELSE 3 END) || '-S' || least(4, 1 + depth) || '-P1'
      WHEN material_type = 'cores' THEN 'spot_core-R' || (CASE k WHEN 5 THEN 2 ELSE 1 END) || '-S' || least(5, 1 + depth)
      WHEN material_type = 'aggregate' AND depth = 0 THEN CASE WHEN agg_raw_or_rap = 'RAP' THEN 'spot_bay2' ELSE 'spot_bay1' END
      ELSE 'spot_sieve-R' || (CASE WHEN k IN (0, 2, 3) THEN 1 ELSE 2 END) || '-S' || (CASE k WHEN 0 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 1 ELSE 3 END) || '-P' || (CASE WHEN agg_raw_or_rap = 'RAP' AND k = 4 THEN 2 ELSE 1 END)
    END AS place
  FROM k;

  -- How each place reads, e.g. "Mix Shelf M1 · R1 · B1"
  ALTER TABLE demo_place ADD COLUMN detail text, ADD COLUMN room text;
  UPDATE demo_place d SET
    detail = s.name || CASE WHEN q.mm IS NULL THEN ''
      ELSE ' · ' || s.rack_names[q.mm[2]::int] || ' · ' ||
        CASE WHEN s.places > 1 THEN chr(64 + q.mm[3]::int) || q.mm[4] ELSE 'Shelf ' || chr(64 + q.mm[3]::int) END END,
    room = s.room
  FROM (SELECT id, place, regexp_match(place, '^(.+)-R(\d+)-S(\d+)(?:-P(\d+))?$') AS mm FROM demo_place) q,
       (SELECT x->>'id' AS id, x->>'name' AS name, coalesce((x->>'placesPerShelf')::int, 1) AS places,
               ARRAY(SELECT jsonb_array_elements_text(coalesce(x->'rackNames', '[]'::jsonb))) AS rack_names,
               (SELECT r->>'name' FROM jsonb_array_elements((SELECT rooms FROM storage_layouts WHERE id = lay)) r WHERE r->>'id' = x->>'room_id') AS room
        FROM jsonb_array_elements((SELECT spots FROM storage_layouts WHERE id = lay)) x) s
  WHERE q.id = d.id AND s.id = coalesce(q.mm[1], q.place);

  -- Old zone rows and any earlier demo filing are released
  UPDATE storage_locations SET occupied = false, project_id = NULL, material_id = NULL, project_name = NULL,
    material_type = NULL, occupied_at = NULL, occupied_by = NULL
  WHERE organization_id = org;

  INSERT INTO storage_locations (location_id, location_label, facility, occupied, project_id, material_id, project_name, material_type, occupied_at, occupied_by, organization_id)
  SELECT place, detail, 'Main Floor', true, project_id, id, project_name, material_type, created_at, owner, org FROM demo_place;

  UPDATE project_materials m SET locations = jsonb_build_array(jsonb_build_object(
      'location_id', d.place, 'location', 'Main Floor · ' || d.room, 'detail', d.detail)),
    storage_confirmed = true
  FROM demo_place d WHERE d.id = m.id;
END $$;

-- Check: materials per spot
SELECT split_part(regexp_replace(location_id, '-R\d+-S\d+(-P\d+)?$', ''), '-', 1) AS spot, count(*) AS materials,
       count(DISTINCT location_id) AS places_used
FROM storage_locations WHERE organization_id = 'a4345d66-42c9-471d-a232-853ebad74bdb' AND occupied
GROUP BY 1 ORDER BY 1;
