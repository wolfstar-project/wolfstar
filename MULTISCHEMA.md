# Prisma Multischema Setup

This project uses Prisma's multischema feature to organize database models into logical schemas:

## Schema Organization

### `core` Schema
Contains the main application data models:
- **Guild**: Discord server configurations and settings
- **User**: User-specific preferences and data

### `moderation` Schema  
Contains moderation-specific data models:
- **Moderation**: Moderation case records and actions

### `system` Schema
Contains system and maintenance-related models:
- **Migration**: Database migration tracking
- **Schedule**: Scheduled task management

## Benefits

1. **Better Organization**: Related models are grouped together
2. **Security**: Different schemas can have different access permissions
3. **Maintenance**: Easier to manage and understand the data structure
4. **Scalability**: Can be easily extended with additional schemas

## Migration Notes

- Existing tables are moved from `public` schema to their respective schemas
- Raw SQL queries have been updated to reference the correct schema names
- The multischema feature requires PostgreSQL
- All functionality remains backward compatible

## Usage

The Prisma client works exactly the same way, but now with better organization:

```typescript
const prisma = new PrismaClient();

// Core schema models
const guild = await prisma.guild.findFirst();
const user = await prisma.user.findFirst();

// Moderation schema models  
const moderation = await prisma.moderation.findFirst();

// System schema models
const schedule = await prisma.schedule.findFirst();
```