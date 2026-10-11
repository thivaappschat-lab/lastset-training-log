# LastSet — Third-party software and materials register

This document identifies dependencies observed in `package.json` and
highlights open provenance questions. It is **not a complete license audit**
or a replacement for notices supplied with third-party packages.

| Component | Declared purpose | License information (source) | Status |
|---|---|---|---|
| `@playwright/test` (declared `^1.55.0`) | Developer testing | Apache License 2.0 (Microsoft Playwright project) | Development dependency; retain upstream license and notices if redistributed |
| `sharp` (declared `^0.34.4`) | Build-time image processing | Apache License 2.0 (Sharp project); bundled native libraries may have separate terms | Build dependency; inspect version-specific notices and libvips transitive licenses |

Upstream information:
- Playwright: https://github.com/microsoft/playwright
- Sharp: https://github.com/lovell/sharp
- Sharp's packaged image libraries: https://github.com/lovell/sharp-libvips

## Items requiring owner verification before wider commercialization

- Original provenance, license, and permission to use each anatomy diagram,
  generated body illustration, hero image, icon, animation, and exported SVG.
- Whether any artwork is an adaptation of a third-party copyrighted original
  or subject to a stock-provider, generative-media, or contractor license.
- All fonts, icon sets, and any code snippets copied from external sources.
- Full transitive dependency/SBOM inventory (there is no committed npm lockfile
  in the repository at the time of this review).
- Any user-submitted photos and workout records, which belong to their
  respective rights holders and should not be reused without permission.

## Ownership boundary

The proprietary notice for the original LastSet product does not override
any third-party license. Apache-2.0 permits uses specified by that license;
LastSet does not acquire ownership of Playwright, Sharp, libvips or others.
Generated and AI-assisted assets must be assessed according to their actual
source terms and applicable law.

Last reviewed: 2026-10-11.
