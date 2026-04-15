# AGENTS.md - wolfstar Bot

## Project Overview

Discord bot built on **Sapphire Framework** (discord.js). TypeScript, PostgreSQL (Prisma ORM).

## Conventions

- **Language:** TypeScript (strict mode, `@sapphire/ts-config`)
- **Module system:** ESM (`"type": "module"`)
- **Path aliases:** `#lib/*`, `#utils/*`, `#generated/prisma`, `#root/*`, `#languages`
- **Naming:** camelCase for files/variables, PascalCase for classes
- **Build tool:** tsdown
- **Formatter/Linter:** oxlint + oxfmt, prettier
- **Test runner:** vitest (globals enabled, setup in `tests/vitest.setup.ts`)
- **Package manager:** pnpm (workspace)

## Database

- **ORM:** Prisma Client v7+ with `@prisma/adapter-pg`
- **Schema:** `prisma/schema.prisma`
- **Generated client:** `src/generated/prisma/`
- **Prisma config:** `prisma.config.ts`
- **Migrations:** `prisma/migrations/` (PostgreSQL)
- **Access:** `container.prisma` (Sapphire container)

## Settings System

- **Cache:** In-memory `Collection<string, GuildData>` in `src/lib/database/settings/functions.ts`
- **Context:** `SettingsContext` in `src/lib/database/settings/context/SettingsContext.ts`
    - Holds `AdderManager`, `PermissionNodeManager`, word filter regex, rate limiter
    - Has `update(settings, data)` for patching context on settings change
- **Structures:** `src/lib/database/settings/structures/` (AdderManager, PermissionNodeManager, Serializer, SerializerStore)
- **Exports:** `src/lib/database/settings/index.ts` re-exports all
- **Top-level:** `src/lib/database/index.ts` re-exports settings + matchers

## Test Patterns

- Tests mirror `src/` structure under `tests/`
- Existing structure tests: `tests/lib/database/settings/structures/PermissionNodeManager.test.ts`
- vitest globals enabled (no explicit imports for `describe`, `it`, `expect`)

## Plan Directory

`.atlas/plans/*`
