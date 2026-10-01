# Changelog

## 1.2.0 (2026-10-01)

- `sandpile` a pixel a cell: 1,250,000 grains (16 times as many), grown ahead of time, exactly,
  by `tools/render-sandpile.js` and stored in `assets/` (1.8 MB); the page plays the 168 piles
  back in 42 s, and the Pi topples nothing. New colours: gold, rose and indigo. `sandpileCell`
  is gone. The same in MMM-Sandpile 1.1.0.

## 1.1.0 (2026-09-29)

- Three more simulations, each also a module of its own: `standardMap` (Chirikov's standard map
  at four kick strengths, MMM-StandardMap), `waterwheel` (Malkus's chaotic waterwheel and its
  Lorenz butterfly, MMM-ChaoticWaterwheel) and `sandpile` (the abelian sandpile, MMM-Sandpile).
  New options `standardMapK` and `sandpileCell`.

## 1.0.0 (2026-09-28)

- Only the chaos simulations. The pages that aren't chaos are modules of their own now, with
  their history: MMM-Atom, MMM-FractalZoom, MMM-Chladni, MMM-SacredGeometry, MMM-Tilings,
  MMM-PlanetsDance, MMM-SnowCrystal, MMM-NightSky and MMM-PhotoDeck.
- `turns`, so modules sharing a page can take turns.
- A screenshot, and Installation / Update / Configuration sections for the module list.
