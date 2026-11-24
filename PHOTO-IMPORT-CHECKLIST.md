# Verified product photograph handoff

**Do not substitute other product images.** The three full-photo files below were checked byte-for-byte against the photos provided in the conversation. The compact thumbnails are separate derivatives, not replacements.

| Product | Full original file | SHA-256 prefix | Card thumbnail |
|---|---|---|---|
| Mental Reset | mental-reset-full.jpg | c84ae07907485386 | mental-reset-thumbnail.webp |
| Nerve Pain Relaxant | nerve-pain-relaxant-full.jpg | 2a55e50b80374283 | nerve-pain-relaxant-thumbnail.webp |
| Appetite Suppressant | appetite-suppressant-full.jpg | be91a6abff4c3e5a | appetite-suppressant-thumbnail.webp |

Full-original dimensions: Mental Reset 2048×1536; other two 1350×1800. All thumbnails are 800×400.

## Current state

- The original photographs and their separate thumbnails were packaged in the chat artifact `wildwood-willow-product-photos-ready.zip`. **They have not been committed to this GitHub repository.**
- Product records `content/products/{mental-reset,nerve-pain-relaxant,appetite-suppressant}.md` deliberately have empty `image_full` and `image_thumb` until the exact files are uploaded.
- Old image files named `mental-reset.jpg`, `nerve-pain-relaxant.jpg`, and `appetite-suppressant.jpg` already exist under `images/`, but **their provenance was not verified**. Do not use or link them.
- The CMS fields already exist. For each entry under **Products**, upload the matching original JPEG into **Full Product Photo**, then upload the matching 800×400 WebP into **Card Thumbnail**, and save the entry.
- The front end uses `image_thumb || image_full || image` for product cards and `image_full || image || image_thumb` on the detail page.
- Preserve the store availability setting. This photo handoff must not reopen ordering or initiate the GitHub ownership transfer.

## Verification before completion

Confirm that both photo fields save under the correct product; check the small homepage thumbnail, category and shop cards, full product page and tap-to-enlarge viewer. Do not claim the photos are live until all three actual image files and corresponding thumbnails are in the repository and confirmed visually.
