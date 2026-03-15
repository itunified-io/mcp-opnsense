#!/usr/bin/env node
/**
 * Pre-publish security scan — blocks npm publish if forbidden files
 * would be included in the tarball.
 *
 * Part of ADR-0026: Pre-Publish Security Scan for npm Packages.
 * Runs automatically via the prepublishOnly hook in package.json.
 *
 * Usage:
 *   node scripts/prepublish-check.js
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const FORBIDDEN_PATTERNS = [
  ".mcpregistry_",
  "/.env",
  ".pem",
  ".key",
  "credentials",
  ".claude/",
  ".github/",
];

// File extensions that are always safe (don't flag api-key.js or package-lock.json)
const SAFE_EXTENSIONS = [".js", ".ts", ".json", ".md", ".txt", ".yaml", ".yml", ".mjs", ".cjs"];

// Patterns that MUST match exactly (not substring)
const EXACT_BLOCK = [".mcpregistry_", "/.env", ".claude/", ".github/"];

function main() {
  console.log("Pre-publish security scan (ADR-0026)...\n");

  // 1. Verify .npmignore exists
  if (!existsSync(".npmignore")) {
    console.error("BLOCKED: .npmignore file is missing!");
    console.error("Every publishable MCP repo MUST have .npmignore (ADR-0026)");
    process.exit(1);
  }

  // 2. Get list of files that would be published
  let packOutput;
  try {
    packOutput = execFileSync("npm", ["pack", "--dry-run"], {
      encoding: "utf-8",
      stderr: "pipe",
    });
  } catch (error) {
    // npm pack --dry-run outputs file list to stderr
    packOutput = error.stderr || error.stdout || "";
  }

  // npm pack --dry-run outputs to stderr, combine both
  let fullOutput;
  try {
    fullOutput = execFileSync("npm", ["pack", "--dry-run", "--json"], {
      encoding: "utf-8",
    });
  } catch {
    // Fallback: use non-json output
    fullOutput = packOutput;
  }

  // Parse file list — look for lines that look like file paths
  const allOutput = packOutput + "\n" + fullOutput;
  const lines = allOutput.split("\n");
  const files = lines
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line.startsWith("npm") || line.startsWith("=")) return false;
      if (line.includes("Tarball") || line.includes("integrity")) return false;
      if (line.includes(":") && !line.includes("/")) return false;
      // Keep lines that look like file paths
      return line.includes("/") || line.includes(".");
    });

  if (files.length === 0) {
    console.log("Warning: Could not parse file list from npm pack. Running basic checks only.\n");
  } else {
    console.log(`Files in tarball: ${files.length}\n`);
  }

  // 3. Check each file against forbidden patterns
  const violations = [];

  for (const file of files) {
    const lower = file.toLowerCase();
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (lower.includes(pattern.toLowerCase())) {
        // For non-exact patterns (.pem, .key, credentials), allow safe file extensions
        if (!EXACT_BLOCK.includes(pattern)) {
          const isSafeFile = SAFE_EXTENSIONS.some((ext) => lower.endsWith(ext));
          if (isSafeFile) continue;
        }
        violations.push({ file, pattern });
      }
    }
  }

  if (violations.length > 0) {
    console.error("BLOCKED: Forbidden files found in tarball!\n");
    for (const v of violations) {
      console.error(`  ${v.file} (matches: ${v.pattern})`);
    }
    console.error("\nFix .npmignore to exclude these files, then try again.");
    process.exit(1);
  }

  console.log("Security scan passed — no forbidden files in tarball.\n");
}

main();
