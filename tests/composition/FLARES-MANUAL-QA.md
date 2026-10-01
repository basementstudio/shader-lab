# Flares — focused manual test

Scope: the cross flare the user kept from the Color Halos prototype (reference 04, and the user's skull composition of September 23, 2026). Color Halos was dropped at the user's request.

## Basics

1. Put Flares above a photo with small bright highlights (eyes, teeth, metal, lights). New layers start on **Cross**: thin orange rays with a hot white core from each bright point.
2. **Style**: Cross, Star (8 rays, alternating short ones), Starburst (14 jittered rays), Asterisk (6 rays), Anamorphic (a long horizontal blue streak). A style sets the shape and colors; Threshold and Isolation stay as you set them.

## Controls to push

- **Threshold:** how bright a point must be. **Isolation:** only points brighter than their surroundings flare, so a bright sky stays clean; 0 lets everything bright flare.
- **Intensity.**
- **Shape:** Rays (1–16), Rotation, Length, Secondary Rays (below 1 makes a star), Length Jitter and Seed, Thickness, Falloff.
- **Color:** Ray Color, Core Color, Core Glow, Core Size.

## Scope, persistence and export

1. Group it with a photo: only that photo's highlights flare. Flares spread over transparent areas inside the group.
2. Save/reload, duplicate, undo a style change: settings return exactly. Export PNG and video: identical to the canvas; flares follow moving highlights in video.

Limits: flares are computed at quarter resolution, so very thin rays stay slightly soft. Long rays with many rays cost more.
