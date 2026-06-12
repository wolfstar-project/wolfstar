import { defineConfig } from "prisma/config";
import "dotenv/config";

export default defineConfig({
	schema: "projects/shared/src/lib/prisma/schema.prisma",
	migrations: {
		path: "projects/shared/src/lib/prisma/migrations",
	},
	datasource: {
		// Use process.env so non-Prisma tools (knip) can load this file without DATABASE_URL
		url: process.env.DATABASE_URL ?? "",
	},
});
