# tlk.io Mod Bot

## Overview
A moderation bot for tlk.io chat rooms built with Node.js, TypeScript, and Playwright. The bot runs a headless Chromium browser to monitor chat messages and automatically delete messages that violate rules.

## Features
- Automatic message moderation (blocks media links, blocked users)
- Admin web interface for managing blocked users
- Hourly rules message broadcast
- Session cookie persistence

## Project Structure
```
src/
├── index.ts    # Entry point
├── bot.ts      # Main bot logic (monitoring, moderation, admin server)
└── config.ts   # Configuration (selectors, URLs, regex patterns)
```

## Running the Bot
- **Build**: `npm run build` - Compiles TypeScript to JavaScript in `dist/`
- **Start**: `npm start` - Runs the compiled bot

## Configuration
- `ADMIN_KEY` - Environment variable for admin interface authentication (defaults to "default_admin_key")
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` - Path to system Chromium binary
- `PORT` - HTTP server port (defaults to 5000)

## Admin Interface
Access at `/admin/blocked-users?key=YOUR_ADMIN_KEY` to manage blocked usernames.

## Data Files
- `session-cookies.json` - Browser session cookies for tlk.io
- `blocked-users.json` - List of blocked usernames

## Technical Notes
- Uses Playwright with system Chromium (installed via Nix)
- Express server on port 5000 for health checks and admin UI
- Polls chat every 500ms for new messages
