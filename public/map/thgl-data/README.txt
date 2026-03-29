Ingested from TH.GL CDN (data only).
- version.json — full site map config (filters, tiles, drawings, regions).
- tiles.json — tile layer config.
- nodes/*.raw — binary spawn/marker blob (format proprietary; for archival).
- landmarks.geojson — Points from drawings + region centers, projected onto local Pywel pixel space.
- region-borders.geojson — Region outlines for the map (Voronoi from region centers until TH.GL ships polygon borders); refresh with `npm run build-region-borders` after ingest.
- coords-meta.json — bounds used for projection.
