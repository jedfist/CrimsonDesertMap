Ingested from TH.GL CDN (data only).
- version.json — full site map config (filters, tiles, drawings, regions).
- tiles.json — tile layer config.
- nodes/*.raw — binary spawn/marker blob (format proprietary; for archival).
- landmarks.geojson — Points from drawings + region centers, projected onto local Pywel pixel space.
- coords-meta.json — bounds used for projection.
- border-regions.json — user-drawn region polygons + labels; written by the dev server via LowDB (commit this file to keep data in the repo).
