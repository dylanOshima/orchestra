#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

const copyDirs = ['skills', 'agents', 'commands', 'scripts', 'tools'];

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      // Skip TS source files for non-skill copies, but copy everything for skills/agents/commands/scripts
      // For tools we want to keep .md sidecars if any, but JS from TS already compiled
      if (srcDir.includes(path.join('src', 'tools')) && entry.endsWith('.ts')) {
        continue; // TS compiled to dist/tools/*.js via tsc
      }
      if (srcDir.includes(path.join('src', 'scripts')) && entry.endsWith('.ts')) {
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const dir of copyDirs) {
  copyRecursive(path.join(src, dir), path.join(dist, dir));
}

// Also copy root skills/agents if they exist at root level (for opencode discovery via config hook)
const rootSkills = path.join(root, 'skills');
if (fs.existsSync(rootSkills)) {
  copyRecursive(rootSkills, path.join(dist, 'skills'));
}

console.log('Assets copied to dist/');
