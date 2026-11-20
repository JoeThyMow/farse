# News site

A plain static news site for GitHub Pages. No framework, no Jekyll, no installs.
URLs have no `.html` (for example `/article/harbor-district-reopens/`).

## Put it online

1. Create a GitHub repo and upload everything in this folder.
2. Repo **Settings > Pages**, set the source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Optional: add a custom domain in the same Pages screen.

Links are relative, so the site works at a domain root or under `username.github.io/repo-name`.
If you use a repo-name URL, also set `"basePath": "/repo-name"` in `site.json` (only the 404 page needs it).

## Preview on your computer

Run `node serve.js` and open http://localhost:8080. (Opening `index.html` directly shows the front page,
but folder links need a server, which is what `serve.js` is.)

## Your name and logo

Edit `site.json`:

- `name` - the site name shown in the header, footer and welcome line
- `logo` - path to your logo file (default `images/logo.svg`; PNG or SVG both work)
- `showNameBesideLogo` - set to `false` if your logo already includes the name
- `tagline`, `contactEmail`, `basePath`

Replace `images/logo.svg` with your logo, or point `logo` at a new file.

## Adding an article

Create a file in `articles/`, for example `2026-12-01-my-story.md`:

```
---
title: My Headline
date: 2026-12-01
author: Jane Reporter
tags: local, politics
image: images/my-photo.jpg
imageAlt: Short description of the photo
summary: One or two sentences shown on the front page.
---

Article text in Markdown goes here.
```

- The **newest `date`** becomes the big featured article on the front page; the next six fill the right-hand list.
- The file name sets the URL (the leading date is dropped). Add `slug: custom-name` to override it.
- Put photos in `images/`. Add `draft: true` to hide an article.
- Tags create topic pages automatically.

## Rebuilding

The pages are generated from your articles. Either:

- **Automatic:** push to `main` and the included GitHub Action runs the build and commits the result, or
- **Manual:** run `node build.js` (needs Node 18+) and commit the output.

The build also writes `articles.json`, an index of every article.

## Pages

`pages/about.md` and `pages/contact.md` become `/about/` and `/contact/`. Add more `.md` files there
for more pages. `{{name}}` and `{{email}}` insert values from `site.json`.

## Dark mode

Follows the visitor's system setting by default. The header button overrides it and remembers the choice.
