# AGENTS

This repo is "A CLI for OBS" (command: `obsx`).

- Build: `npm run build`
- Lint: `npm run lint`
- Run from repo: `npm run dev -- <command>`
- Run from anywhere: `npx zeke/obsx <command>`

Conventions:

- Prefer small, explicit CLI args (no magic config files).
- Default directory behavior should use the caller's current working directory.
- Keep output human-readable; avoid dumping large JSON.
