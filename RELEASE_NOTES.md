# Frutiger Liquid Glass 0.2.0

- Synchronizes with Frutiger 0.2.0 Style Settings wallpaper classes.
- Adds local WebGL versions of Aqua Current, Glass Bubbles, and DORFic Daylight.
- Adds a warm DORFic shader tint and redraws immediately when Style Settings changes.
- Keeps the original Aero landscape as the default.

The added presets are generated locally and introduce no network requests.

# Frutiger Liquid Glass 0.1.1

First public release candidate of the desktop WebGL2 glass companion for the Frutiger Obsidian theme.

This update uses a Community Directory compliant manifest description and adds reproducible build metadata.

- Bundled local Aero landscape with refracted sidebars, active tabs, and note panes.
- Adjustable refraction strength, glass edge thickness, color dispersion, and reflection brightness.
- Command palette toggle and CSS fallback when the effect is off or WebGL2 is unavailable.
- Event-driven rendering that stops while idle or hidden.

Tested with Frutiger on Obsidian 1.14.5 for macOS. Requires desktop WebGL2. Pop-out windows retain the theme's CSS appearance. The plugin does not capture note or desktop pixels and makes no network requests.

Shader adapted from Liquid Glass Studio by Charles Yin under MIT; see `NOTICE.md` and `LICENSE`.
