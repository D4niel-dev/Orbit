# Orbit Website

The official website for **Orbit** — a local-first, peer-to-peer, end-to-end encrypted messenger.

**Live:** https://d4niel-dev.github.io/Orbit/

This repository holds the Orbit landing page: the download links, the feature and security overviews, the
FAQ and the current release announcement. It does **not** contain the desktop or Android application
source — that lives in [D4niel-dev/Orbit-beta](https://github.com/D4niel-dev/Orbit-beta).

![The Orbit landing page](docs/images/app/preview-darkmode.png)

---

## What is on the page

A single page, in this order: hero · app preview · features · how it works · architecture · **security and
trust** · FAQ · download · footer.

The security section is the one worth knowing about. It states plainly what Orbit protects and what it does
not — the local-network requirement, the missing key-change warning, the fact that translate and GIF search
are not covered by the encryption, and the unsigned installers — alongside how to verify a download against
the release key. If you change one thing on this site, do not soften that section: it is the reason a
privacy-minded visitor trusts the rest of the page.

## Requirements

None. The site is plain HTML, CSS and JavaScript with **no build step, no framework and no dependencies** —
open `index.html` and it runs. That is a deliberate constraint rather than an accident: a static page with
no toolchain cannot rot, and there is nothing to install to contribute a fix.

## Development

```bash
git clone https://github.com/D4niel-dev/Orbit.git
cd Orbit

# serve the repository, then open http://localhost:8000/docs/
python -m http.server 8000
```

`npx serve .` works just as well. Serve it rather than opening the file directly: the page loads fonts and
images by relative path, and `file://` is stricter about that than a real server.

## Repository structure

```text
Orbit/
├── docs/                  # the published site — this is what GitHub Pages serves
│   ├── index.html         # the page itself (markup only; styles and script are separate)
│   ├── styles.css         # all styling, including the light/dark themes
│   ├── images/
│   │   ├── app/           # app screenshots — one per theme, plus the chat/gallery/group views
│   │   └── hero/
│   ├── favicon/
│   ├── fonts/
│   ├── orbit.ico
│   └── orbit_256.png
├── LICENSE
└── README.md
```

## Deployment

GitHub Pages serves the `docs/` folder, so anything merged into the default branch is live within a minute
or two. There is no build and no deploy step to run. If you fork this repository, check that
**Settings → Pages → Source** still points at the default branch and the `/docs` folder.

## Shipping a new version of the site

When the app publishes a release, two things here are updated **by hand** — and they are the two that
drift, because nothing fails loudly if they are missed:

1. **The version and the announcement.** Three places, and they should all name the same version:
   `var ORBIT_VERSION = 'v0.7.2-beta'` near the bottom of `docs/index.html`; the `.announcement-text`
   string in the script just above it (the announcement bar is built in JavaScript, not in the markup);
   and the JSON-LD `softwareVersion` in the page head, which is written *without* the `v`.
2. **The release link**, if the changelog has moved, and the download table's newest row.

A one-line script that reads the app repository's latest tag and writes those fields would remove the
whole class of mistake. Until then it is a checklist item on every release.

## Roadmap

**Already here:** the theme gallery, the security and trust section, the FAQ, the release announcement,
download links per platform.

**Still to come:** per-platform installation guides, a documentation section (the site is one page today),
and a developer reference for the shared protocol.

**Not on the roadmap until the application supports it:** a plugin marketplace, module documentation and a
third-party developer API. Orbit has no plugin API today — those items would describe something that does
not exist, and this page should not be the place that promises it. If a plugin system ever ships, they
belong here; until then they are noise that costs credibility.

## Contributing

Contributions are welcome. Fork, branch, commit, open a pull request.

Two things to keep in mind:

- **Keep it lightweight.** No frameworks, no dependencies, no tracking scripts, no external CDNs beyond
  what is already there. The page should stay readable as plain HTML and CSS.
- **Keep it honest.** The security section and the FAQ describe what the app actually does, limitations
  included. If a claim on this page is not true of the shipped build, that is a bug — please open an issue
  rather than adjusting the wording.

## Security

This repository serves static files and has no backend, so there is little here to attack. For anything
concerning the **application** — its encryption, its network behaviour, or a vulnerability — please follow
the app repository's [SECURITY.md](https://github.com/D4niel-dev/Orbit-beta/blob/main/SECURITY.md) and
report it privately rather than in a public issue.

## Related repositories

| Repository | Purpose |
|------------|---------|
| [D4niel-dev/Orbit-beta](https://github.com/D4niel-dev/Orbit-beta) | The desktop and Android application, its releases, and its security policy |
| [D4niel-dev/Orbit](https://github.com/D4niel-dev/Orbit) | This repository — the website, documentation and downloads |

## License

Orbit is licensed under the **MIT License**. You are free to use, modify, distribute and contribute under
its terms. See [LICENSE](LICENSE) for the full text.

---

<p align="center">
<strong>Orbit</strong><br>
Local-first communication. No mandatory cloud.
</p>
