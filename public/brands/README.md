# Brand logos

Drop each brand's logo PNG here, named `<brandId>.png`:

- `internwise.png` — the wide "INTERNWISE / Your Internship Specialist" logo you sent.
- `reportingwise.png`
- `flora-hr.png`

**Format**: PNG with **transparent background** is ideal so the logo composites cleanly on any image. JPGs work but will show a white box.

**Aspect ratio**: anything. The graphic agent measures the file and preserves aspect ratio when overlaying.

**Resolution**: at least 600px on the long edge. The agent uses the logo at ~22% of canvas width by default (so ~225px on a 1024px image), and a higher-res source keeps it sharp.

If a logo file is missing for a brand, the graphic agent falls back to a coloured initials badge using `brand.colors`.
