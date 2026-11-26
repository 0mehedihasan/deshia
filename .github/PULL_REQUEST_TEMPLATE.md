## Summary

<!-- What changed and why? Link related issues. -->

## Area

- [ ] Annotation tools / canvas
- [ ] Schema / ontology
- [ ] Persistence / recovery
- [ ] Export / import
- [ ] Video / tracks
- [ ] UI / docs
- [ ] Build / CI

## Data safety checklist

- [ ] Source images remain read-only; outputs are written only to the output tree
- [ ] No annotation data is silently deleted; history stays append-only
- [ ] An image is never marked `ANNOTATED` before files are verified on disk
- [ ] New behavior is documented in `docs/` and `.claude/CLAUDE.md` where relevant
- [ ] No new dependency without justification

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build` (when build output is touched)
- [ ] `pnpm test:e2e` (when the annotation loop is touched, if browser available)
