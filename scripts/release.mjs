#!/usr/bin/env node
// One command to cut a release:  npm run release -- patch|minor|major|1.2.3
// Checks the tree, runs the full checks, bumps the version, commits, tags and pushes. CI then re-checks and stages
// the package on npm; you approve it with your security key. Nothing is published by this script.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
const sh = (cmd, args, opts = {}) => (execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: opts.show ? 'inherit' : ['ignore', 'pipe', 'pipe'] }) ?? '').trim()
const fail = (msg) => { console.error(`release: ${msg}`); process.exit(1) }

const bump = process.argv[2]
if (!bump) fail('say what to bump: patch, minor, major or an exact version, for example: npm run release -- patch')
if (sh('git', ['branch', '--show-current']) !== 'main') fail('release from main.')
if (sh('git', ['status', '--porcelain'])) fail('the working tree has uncommitted changes. Commit or stash them first.')
sh('git', ['fetch', 'origin', 'main'])
if (sh('git', ['rev-parse', 'HEAD']) !== sh('git', ['rev-parse', 'origin/main'])) fail('main is not in sync with origin/main. Pull or push first.')

console.log('release: running the full checks')
sh('npm', ['run', 'check'], { show: true })

const version = sh('npm', ['version', bump, '--no-git-tag-version']).replace(/^v/, '')
let log = readFileSync(`${root}CHANGELOG.md`, 'utf8')
if (!new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm').test(log)) {
  log = log.replace(/^# Changelog\n/, `# Changelog\n\n## ${version}\n\n- \n`)
  writeFileSync(`${root}CHANGELOG.md`, log)
  console.log(`release: added a "## ${version}" heading to CHANGELOG.md. Fill in the notes, commit, then run this again with ${version}.`)
  sh('git', ['checkout', '--', 'package.json', 'package-lock.json'])
  process.exit(1)
}
sh('git', ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md'])
sh('git', ['commit', '-m', `Release ${version}`])
sh('git', ['tag', `v${version}`])
sh('git', ['push', 'origin', 'main', `v${version}`])
console.log(`release: v${version} pushed. CI will check and stage it.`)
console.log('release: approve it at https://www.npmjs.com/settings/karthiknish/staged-packages (security key).')
