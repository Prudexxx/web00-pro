# WEB00 GitHub Pages Actions Deployment Fix Report

## 1. Problem

- GitHub Pages is currently configured as a legacy branch deployment from `main /`.
- The pushed frontend final commit is `d2e809103f5fa85e05de2b5127dac7ac97e55c58`.
- The local frontend was accepted by video QA: `VIDEO_QA_ACCEPTED`, with P0/P1/P2/P3 = 0.
- The legacy Pages deployment fails in the deploy step with `actions/deploy-pages@v5`: `Deployment failed, try again later.`
- GitHub Pages API reports `status: errored`, `build_type: legacy`, `source: main /`.
- The latest legacy Pages run for `d2e8091` completed with `failure`.

## 2. Decision

- Keep GitHub Pages as the publishing target.
- Replace the hidden legacy branch deploy path with an explicit GitHub Actions workflow.
- Build a clean static `_site` artifact inside the workflow and deploy that artifact through GitHub Pages Actions.
- Do not change product HTML, CSS, JS, images, PWA files, backend, or catalog/pricing content for this deployment fix.

## 3. Workflow

| Item | Value |
|---|---|
| Path | `.github/workflows/pages.yml` |
| Triggers | `push` to `main`, `workflow_dispatch` |
| Permissions | `contents: read`, `pages: write`, `id-token: write` |
| Artifact path | `_site` |
| Upload action | `actions/upload-pages-artifact@v4` |
| Deploy action | `actions/deploy-pages@v4` |

The workflow prepares `_site` by copying:

- root `*.html` pages;
- `manifest.webmanifest`;
- `sw.js`;
- `robots.txt`, if present;
- `sitemap.xml`, if present;
- `assets/`;
- `.nojekyll`.

It also asserts that the Matryoshka hero production assets exist before deployment:

- `_site/assets/img/matryoshka-hero-720.webp`;
- `_site/assets/img/matryoshka-hero-1200.webp`;
- `_site/assets/img/matryoshka-hero-1600.webp`;
- `_site/assets/img/matryoshka-clean-final.png`.

## 4. Owner manual action required

Owner must open the GitHub repository and switch Pages source:

`Settings -> Pages -> Build and deployment -> Source -> GitHub Actions`

This task does not change GitHub Pages settings automatically.

## 5. Checks

- Workflow file created: YES.
- Product code unchanged: YES.
- Backend not touched: YES.
- Manual deploy not executed: YES.
- Commit/push not executed in this task: YES.
- Current Pages source before owner action: `main /`, `build_type: legacy`.
- Current Pages status before owner action: `errored`.

## 6. Next step

1. Review `.github/workflows/pages.yml`.
2. Approve commit and push for the workflow/report files.
3. In GitHub repository settings, switch Pages source to `GitHub Actions`.
4. Run the workflow via push or `workflow_dispatch`.
5. Verify live Pages updates to `d2e8091` and serves the Matryoshka WebP assets.
