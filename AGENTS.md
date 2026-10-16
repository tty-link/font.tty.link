# font.tty.link source repository

This repository owns the site pages, navigation, examples, browser integration tests, and static-site build.

- Edit `src/`, `scripts/`, and `tests/` here. `dist/` is ignored generated output.
- Consume the exact `@tty.link/font-kku` dependency in `package.json`. Runtime, fonts, authoring models and studio UI come from that package; do not copy or edit their implementation here.
- Build offline from an installed package, `--package-dir`, or `--package-tarball`. The build must never read a font-kku source checkout.
- Preserve public page paths, `/lib/` assets, `/lib/skill/` documentation, existing saved studio projects, and versioned copy snippets.
- Run `npm test`, `npm run check`, and the relevant browser tests. Run the complete site browser suite for a broad site change.
- Bind local preview servers only to `127.0.0.1` and stop them when finished.
- Keep source and generated deployment checkouts separate. Never run the former font-kku `build_pages.py --out` against this repository.
- Commits on an authorized feature branch are part of the work. Source branch merges, push, publication, deployment, and hosting configuration changes require the user's approval. Do not add remote CI.
- Public commits use `4685308+exploit1st@users.noreply.github.com`; end Codex commit messages with `Co-Authored-By: Codex <noreply@openai.com>`.

See [README.md](README.md) for build, package upgrade, validation and deployment instructions.
