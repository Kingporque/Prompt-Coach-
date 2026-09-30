#!/usr/bin/env node
import { execSync } from 'child_process'
import { copyFileSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

// Determine bump type
const bumpType = process.argv[2] || 'patch'

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function log(msg) {
  console.log(`[release] ${msg}`)
}

// 1. Build
log('Building extension...')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

// 2. Bump version in package.json
const semver = (v) => v.split('.').map(Number)
const [major, minor, patch] = semver(pkg.version)
let newVersion
switch (bumpType) {
  case 'major': newVersion = `${major + 1}.0.0`; break
  case 'minor': newVersion = `${major}.${minor + 1}.0`; break
  default: newVersion = `${major}.${minor}.${patch + 1}`
}
pkg.version = newVersion
writeFileSync(join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
log(`Bumped version: ${pkg.version} → ${newVersion}`)

// 3. Commit
git('git add -A')
git(`git commit -m "Release v${newVersion}"`)

// 4. Tag and push
git(`git tag v${newVersion}`)
git('git push && git push --tags')
log(`Tagged and pushed v${newVersion}`)

// 5. Create a simple zip for now (GitHub Release artifacts can be added manually
//    or via GitHub Actions in the repo's .github/workflows)
const versionedZip = join(ROOT, `prompt-optimizer-v${newVersion}.zip`)
execSync(`cd dist && zip -r "${versionedZip}" .`, { stdio: 'inherit' })
copyFileSync(versionedZip, join(ROOT, 'prompt-optimizer.zip'))
copyFileSync(join(ROOT, 'scripts/install.ps1'), join(ROOT, 'prompt-coach-install-windows.ps1'))
copyFileSync(join(ROOT, 'scripts/install.sh'), join(ROOT, 'prompt-coach-install-linux-macos.sh'))
log(`Created prompt-optimizer-v${newVersion}.zip`)
log('Created prompt-optimizer.zip for the installer scripts')
log('Prepared separate Windows and Linux/macOS installer downloads')

// 6. Open release page
const repoUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
  .replace(/\.git$/, '')
  .replace('git@github.com:', 'https://github.com/')
console.log(`\n✅ Release v${newVersion} ready!\n`)
console.log(`1. Go to ${repoUrl}/releases/new`)
console.log(`2. Tag: v${newVersion}`)
console.log(`3. Title: v${newVersion}`)
console.log(`4. Upload these four assets:`)
console.log(`   - prompt-optimizer-v${newVersion}.zip`)
console.log(`   - prompt-optimizer.zip`)
console.log(`   - prompt-coach-install-windows.ps1`)
console.log(`   - prompt-coach-install-linux-macos.sh`)
console.log(`5. Publish release\n`)
