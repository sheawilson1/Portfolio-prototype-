# Remote Work Reference

This file is a pre-departure reference for working remotely from phone via Claude.ai Dispatch.

## Projects

| Project | Repo | Stack | Status | Notes |
|---------|------|-------|--------|-------|
| **Portfolio** | `sheawilson1/Portfolio-prototype-` | HTML/CSS/JS | Live at sheawilson.uk | Currently open in this session |
| **Life Dashboard** | `sheawilson1/playground` | TypeScript/Next.js | Live at playground-five-beige.vercel.app | Open as a separate claude.ai session |
| **Conductor IDE** | `sheawilson1/pantheon-agency` | TypeScript | Private | Open as a separate claude.ai session |
| **Women in Design** | `sheawilson1/women-in-design` | HTML | Live (GitHub Pages) | Low priority |

## How to Work from Phone

1. Open **claude.ai** on phone
2. Go to **Claude Code** and start or resume a session
3. Each session is scoped to one repo — pick the one you want to work on
4. Type your task naturally — Claude will make the changes, commit, and push

## Future Project Backlog

- **Avoi** — personal voice AI assistant (to be created)
- **Custom OS** — low-level OS/runtime project (to be created)
- General experiments/builds — `sheawilson1/playground` is a good home for prototypes

## Dev Server Commands

```bash
# Life Dashboard (playground)
cd /home/user/playground && npm run dev      # starts on localhost:3000

# Conductor IDE (pantheon-agency)
cd /home/user/pantheon-agency && npm run dev

# Portfolio (static)
# No server needed — open index.html directly, or push to GitHub Pages
```

## Git Status Check

```bash
# Check all local repos are clean and pushed
git -C /home/user/Portfolio-prototype- status
git -C /home/user/playground status          # if cloned
git -C /home/user/pantheon-agency status     # if cloned
```
