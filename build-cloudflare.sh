set -euo pipefail

rm -rf dist
mkdir -p dist/assets

cp index.html dist/
cp app-v12.html dist/
cp manifest.webmanifest dist/
cp icon-192.png dist/
cp icon-512.png dist/
cp apple-touch-icon.png dist/
cp lastset-theme.css dist/
cp lastset-premium.css dist/
cp lastset-brand.css dist/
cp lastset-identity.css dist/
cp lastset-v0140.css dist/
cp lastset-onboarding.css dist/
cp lastset-offline.css dist/
cp lastset-explore.css dist/
cp lastset-diagnostics.css dist/
cp lastset-diagnostics.js dist/
cp lastset-mobility.js dist/
cp lastset-mobility.css dist/
cp lastset-anatomy.css dist/
cp lastset-images.css dist/
cp lastset-hotfix.css dist/
cp lastset-calendar.css dist/
cp lastset-enhancements.js dist/
cp lastset-premium.js dist/
cp lastset-hotfix.js dist/
cp lastset-smartlog-shorthand.js dist/
cp lastset-core-reliability.js dist/
cp lastset-smartlog-p1.js dist/
cp lastset-smartlog-mobile.js dist/
cp lastset-smartlog-mobile.css dist/
cp lastset-p2.js dist/
cp lastset-p2.css dist/
cp lastset-memory.js dist/
cp lastset-intelligence.js dist/
cp lastset-calendar.js dist/
cp lastset-workouts.js dist/
cp lastset-integrity.js dist/
cp lastset-profile-equipment.js dist/
cp lastset-muscle-library.js dist/
cp lastset-navigation.js dist/
cp lastset-beta.js dist/
cp lastset-brand.js dist/
cp lastset-identity.js dist/
cp lastset-v0140.js dist/
cp lastset-onboarding.js dist/
cp lastset-offline.js dist/
cp lastset-atlas-regions.js dist/
cp lastset-anatomy.js dist/
cp lastset-explore.js dist/
cp service-worker.js dist/
cp _headers dist/
cp _redirects dist/
cp assets/*.webp dist/assets/
# GitHub integrity jobs skip npm installation; make the image build self sufficient.
if ! node -e "require.resolve('sharp')" >/dev/null 2>&1; then
  npm install --no-audit --no-fund --no-package-lock --no-save sharp@0.34.4
fi
node scripts/restore-anatomy-detail.mjs
cp assets/*.svg dist/assets/
node scripts/stamp-release.mjs dist

echo "Cloudflare bundle ready in dist"
