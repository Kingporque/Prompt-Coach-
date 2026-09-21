#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()

function log(step, msg) {
  console.log(`[${step}] ${msg}`)
}

// 1. Create .env file from template (for user API key convenience)
const envPath = join(ROOT, '.env')
const envExamplePath = join(ROOT, '.env.example')

if (!existsSync(envPath)) {
  const content = `# Gemini API key — get free at https://aistudio.google.com/app/apikey
# This is optional; you can always add your key later in the Options page.
GEMINI_API_KEY=
`
  writeFileSync(envPath, content)
  log('env', 'Created .env template (fill in your API key or skip — you can set it later in Options)')
} else {
  log('env', '.env already exists — skipping')
}

// 2. Create .env.example for reference
if (!existsSync(envExamplePath)) {
  writeFileSync(envExamplePath, `# Gemini API key
GEMINI_API_KEY=

# Build mode
NODE_ENV=production
`)
}

// 3. Print next steps
console.log('\n✅ Setup complete!\n')
console.log('Next steps:')
console.log('  1. Edit .env and add your Gemini API key (optional — can do later in Options)')
console.log('  2. npm run build     — builds to /dist')
console.log('  3. Load /dist in chrome://extensions (Enable "Developer mode" → "Load unpacked")')
console.log('\nFor releases: npm run release [patch|minor|major]\n')
