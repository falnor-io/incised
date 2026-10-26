# Releasing

Publishing needs no token and no code. CI stages the package, and you approve it on npmjs.com with your security key.

## Every release

```bash
npm run release -- patch      # or minor, major, or an exact version like 0.2.0
```

That checks the tree, runs the full checks, bumps the version, commits, tags and pushes. The `publish` workflow then
re-checks the tag and runs `npm stage publish`. Then approve it:

1. Open https://www.npmjs.com/settings/karthiknish/staged-packages
2. Click **Approve new release** and touch your security key.

If the changelog has no entry for the new version, the script adds a heading and stops so you can write the notes.
`npm stage list` shows what is waiting, and `npm stage reject <id>` discards one.

## Staging by hand

`npm run stage` stages the current version from your machine. The approval step is the same.

## One-time setup

Do this once, after the first version is live (the package page does not exist before that):

1. https://www.npmjs.com/package/orlune/access, Trusted Publisher, GitHub Actions.
   Organization `falnor-io`, repository `orlune`, workflow filename `publish.yml`.
   Allow only `npm stage publish`, so a stolen CI run still cannot release without your key.
2. On the same page, choose "Require two-factor authentication and disallow tokens".
3. GitHub, repository Settings, Rules, a tag ruleset that lets only admins create `v*` tags.
4. GitHub, repository Settings, Pages, Source: GitHub Actions, so the live demo deploys.

Without step 1 the workflow's `stage` job cannot authenticate. Until then, use `npm run stage`.
