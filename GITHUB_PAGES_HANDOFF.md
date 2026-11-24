# Wildwood & Willow Botanicals: GitHub-only handoff (prepared branch)

This branch is a **staging preparation**, not a completed account transfer or a live GitHub Pages deployment.

## Accounts

- Current repository: `jeromeleegriffin/wildwood-willow`
- Intended new repository: `Wb-2026/wildwood-willow` (confirm account spelling and existence before transfer)
- Intended public URL: `https://wb-2026.github.io/wildwood-willow/`

## What's prepared in this branch

- HTML and JavaScript use relative paths so the site works at a GitHub Pages repository subpath.
- Image references from product/service Markdown are normalized for the new subpath at render time.
- Sveltia CMS repository owner is changed to `Wb-2026/wildwood-willow`.
- Cloudflare OAuth client settings are removed from the **staged** CMS configuration. This supports the CMS's built-in **Sign In with Token** method, which requires the new owner to create their own GitHub fine-grained personal access token and **never share it**.
- A `.nojekyll` file is included to serve static files without Jekyll processing.

## Still required

1. Confirm the actual new GitHub account `Wb-2026` can sign in and accept a transfer; check that no `wildwood-willow` repository already exists.
2. Test the staged site on a temporary GitHub Pages URL, or approve merging this branch for transfer. Avoid changing the live main branch until reviewed.
3. Transfer repository ownership from the current repository's **Settings > General > Danger Zone > Transfer** screen to `Wb-2026`. The recipient must accept GitHub's confirmation email within 24 hours.
4. New owner: Repository **Settings > Pages**, select **Deploy from a branch**, **main**, **/(root)** and save.
5. The new owner must set up a **fine-grained personal access token** in their own GitHub account for the new repository with **Contents: Read and write**; use the built-in **Sign In with Token** option in `/admin/`. Never put a token in this repository or in chat.
6. Verify product photos, categories, service information, cart and admin editing, and test the availability mode `pause_orders`. The current checkout is a placeholder and does not process payments.
7. After the new site is verified, decide when to stop publishing from Cloudflare and share the new address.

## Limitations to understand

- GitHub Pages is static hosting, not a server-side order processor. The current cart is in browser localStorage and the checkout button is a placeholder.
- Store availability is currently enforced by client-side JavaScript, not by a server-side order service. It is not a secure backend shutdown mechanism.
- The existing Cloudflare-hosted admin OAuth flow cannot simply move to GitHub Pages. The token sign-in workaround avoids requiring the new owner to run Cloudflare but is less convenient than OAuth; their token stays on their device.
- Changing source files in this staging branch does **not** transfer repository ownership or activate GitHub Pages.
