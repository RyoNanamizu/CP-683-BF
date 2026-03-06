#!/usr/bin/env node

/**
 * Database setup script
 * Creates the CP683 database
 */

import pg from "pg";
const { Pool } = pg;

async function setupDatabase() {
  console.log("🔧 Setting up database...\n");

  // First, connect to the default postgres database to create CP683
  const defaultPool = new Pool({
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: "postgres",
  });

  try {
    // Create database if it doesn't exist
    console.log("📦 Creating database CP683...");
    try {
      await defaultPool.query("CREATE DATABASE CP683;");
      console.log("✅ Database created");
    } catch (err) {
      if (err.code === "42P04") {
        console.log("✅ Database CP683 already exists");
      } else {
        throw err;
      }
    }

    // Close connection to default database
    await defaultPool.end();

    // Connect to CP683 and create table
    const cp683Pool = new Pool({
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
      database: "CP683",
    });

    await cp683Pool.end();
    console.log("✅ Database setup complete!\n");
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    process.exit(1);
  }
}

setupDatabase();
