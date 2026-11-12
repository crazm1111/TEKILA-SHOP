# TEKILA Shopify theme

This repo **is** the TEKILA storefront theme (store: `dzp80h-jr.myshopify.com`).
The `main` branch is connected to Shopify through the Shopify GitHub integration:
whatever lands on `main` goes live on the store within a minute or two, and edits
made in the Shopify theme editor are committed back to `main` by Shopify.

The theme is based on Shopify Horizon. See `AGENTS.md` (shipped with the theme)
for its conventions: sections, blocks, snippets, and CSS/JS patterns.

## How to change the theme

1. Start from an up-to-date `main` (`git fetch origin main`). Shopify commits to it
   on its own.
2. Work on a feature branch and never push straight to `main`.
3. Open a pull request. The **Theme preview** workflow pushes the branch to an
   unpublished theme and comments a preview link on the PR.
4. The user checks the preview. Merging the PR publishes the change.

## Rules

- `config/settings_data.json` and `templates/*.json` hold merchant content
  (texts, images, section order) that is usually edited in the theme editor. Change
  them only when the task needs it, and keep the change small so it doesn't clash
  with Shopify's own commits.
- Don't commit secrets. Store access lives in the GitHub secrets
  `SHOPIFY_STORE` and `SHOPIFY_CLI_THEME_TOKEN`.
- Keep Liquid valid: the preview workflow runs `shopify theme check`, so read its
  output in the job log.
- The store sells in Egypt/MENA (EGP, cash on delivery is common, mobile-first),
  so check every change on mobile width.

## Re-sync from Shopify

If code was changed directly in Shopify's code editor on a theme that is *not*
the connected one, run the **Pull theme from Shopify** workflow (Actions tab →
Run workflow) to commit those files here.
