# TEKILA Shopify theme

Claude ⇄ GitHub ⇄ Shopify workflow for the TEKILA storefront.

```
Claude (feature branch) ──PR──▶ GitHub ──preview theme──▶ check the link
                                  │
                              merge to main
                                  ▼
                   Shopify (connected theme updates automatically)
```

## One-time setup

### 1. Create a theme access token
1. In Shopify admin, install the **Theme Access** app (free, made by Shopify).
2. Create a password for yourself. It's emailed to you and starts with `shptka_`.

### 2. Add GitHub secrets
In this repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Name | Value |
|---|---|
| `SHOPIFY_STORE` | `dzp80h-jr.myshopify.com` |
| `SHOPIFY_CLI_THEME_TOKEN` | the `shptka_…` password |

### 3. Import the live theme
Go to **Actions → Pull theme from Shopify → Run workflow**, choose the `main`
branch, and leave the theme field empty. The current live theme is committed to the repo.

### 4. Connect Shopify to GitHub
1. In Shopify admin, open **Online Store → Themes → Add theme → Connect from GitHub**.
2. Authorize GitHub, then pick `crazm1111/TEKILA-SHOP` and the `main` branch.
3. A new theme, "TEKILA-SHOP/main", appears in the theme library. It's a copy of
   your live theme. Preview it, then click **Publish**.

From then on, merging to `main` updates the live store, and theme-editor changes
are committed back to `main` automatically.

## Day-to-day
Ask Claude for a change, for example "make the announcement bar sticky". Claude opens
a PR, a preview link is posted on it, you check it, and you merge.
