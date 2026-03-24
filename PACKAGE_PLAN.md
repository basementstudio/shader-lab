# Package Plan

Private working plan for the Shader Lab runtime package and shader export feature.

## Goal

Build a package-backed shader export flow so a developer can:
- install a runtime package
- build a composition in Shader Lab
- export a React snippet
- paste the snippet into their app
- replace placeholder asset paths if needed
- have it work without depending on the editor app itself

## Progress

### 1. Package foundation
- [x] Decide and document the workspace package layout in this repo
- [x] Create the runtime package scaffold under `packages/`
- [x] Add package build/typecheck/lint scripts
- [x] Define the package public entrypoints
- [x] Verify the app can import the package locally during development

### 2. Public runtime API
- [x] Define `ShaderLabConfig`
- [x] Define portable asset descriptor types
- [x] Define portable layer descriptor types for supported v1 layers
- [ ] Define custom shader source variants:
- [x] Inline source config shape
- [x] Imported/module sketch config shape
- [x] Define `ShaderLabComposition` public component API
- [x] Document fields intentionally excluded from the public config

### 3. Export support matrix
- [x] Formalize the v1 supported export layer types
- [x] Formalize the v1 unsupported export layer types
- [x] Add validation rules for unsupported layer types
- [x] Add validation rules for missing/invalid asset references
- [ ] Add validation rules for unsupported runtime conditions if any
- [ ] Design user-facing error messages for blocked exports

### 4. Runtime portability
- [x] Identify which current renderer modules can move into the package cleanly
- [~] Separate editor-only code from portable runtime code
- [x] Move or duplicate portable renderer contracts into package-owned modules
- [ ] Move or duplicate portable pass/runtime implementations into the package
- [ ] Ensure the package does not depend on editor stores or editor UI
- [ ] Ensure the package targets generic browser React rather than app-specific assumptions

### 5. Config serialization
- [x] Add serializer from live editor state to `ShaderLabConfig`
- [x] Strip editor-only state from exported output
- [x] Serialize timeline playback data needed by the runtime
- [x] Serialize image/video assets as placeholder path descriptors
- [x] Serialize custom shader layers with inline source by default
- [x] Preserve enough metadata to later replace inline custom shader code with imported sketches

### 6. Snippet generation
- [x] Design the generated TSX snippet format
- [x] Generate package imports
- [x] Generate `const config: ShaderLabConfig = ...`
- [x] Generate a minimal exported React component wrapper
- [x] Generate placeholder asset paths in a readable way
- [ ] Keep output deterministic for the same input config

### 7. Export UI
- [x] Add a `shader` tab to the export dialog
- [x] Add pre-generation validation feedback
- [x] Add generated code preview
- [x] Add copy-to-clipboard action
- [x] Add package install instructions
- [ ] Keep existing image/video/project export flows unchanged

### 8. Runtime behavior
- [ ] Recreate supported layer stack ordering in the package runtime
- [x] Recreate timeline playback behavior in the package runtime
- [ ] Recreate supported asset loading behavior in the package runtime
- [ ] Recreate custom shader execution in the package runtime
- [ ] Confirm exported snippet works without Shader Lab editor state

### 9. Testing
- [ ] Add serializer tests
- [ ] Add export validation tests
- [ ] Add snippet generation tests
- [ ] Add runtime smoke tests for exported configs
- [ ] Add UI tests for shader export flow if practical in current setup
- [ ] Re-run typecheck after each major milestone
- [ ] Re-run relevant tests after each major milestone

### 10. Documentation
- [ ] Document how to consume the runtime package locally from this repo
- [ ] Document how exported asset placeholders should be replaced
- [ ] Document how inline custom shader export can be converted to imported sketches
- [ ] Document first-release limitations and unsupported layer types

# SESSIONS

## Session 1
- Created the initial package plan file.
- Captured the agreed direction: in-repo workspace package, generic React target, copyable shader snippet export, supported-layer-only first release.
- Added `PACKAGE_PLAN.md` to `.gitignore` so the file stays local.
- Added a workspace package scaffold at `packages/shader-lab-react` with package name `@shader-lab/react`.
- Added root workspace wiring plus runtime build/typecheck scripts.
- Added the first public runtime placeholders: `ShaderLabComposition` and `ShaderLabConfig`.
- Added initial shader export config serialization and support validation in the app.
- Verified local workspace linking with Bun and passing app/runtime typechecks.
- Added snippet generation from `ShaderLabConfig`.
- Added a `shader` export tab with validation blocking, code preview, install hint, and clipboard copy.
- Renamed the runtime package from `@shader-lab/runtime-react` to `@shader-lab/react`.
- Switched exported media references to deterministic placeholder paths under `/replace/{kind}/...` instead of app-local blob URLs.
- Tightened the public package schema with typed timeline structures and parameter values.
- Added export validation for missing media assets and empty custom shader sources.
- Added package-local runtime clock, timeline evaluation, and frame-building primitives with no app imports.

## Session Stop State
- The package and export groundwork is in place and typechecks cleanly.
- The `shader` export tab generates a copyable React snippet that imports `@shader-lab/react`.
- Exported config is now portable enough to be consumed later by a real runtime:
  - deterministic media placeholder paths
  - typed timeline tracks/keyframes
  - inline custom shader source plus metadata for later replacement with imported sketches
- The runtime package still does not render compositions yet. `ShaderLabComposition` remains a placeholder container.
- A direct bridge from the package into the app renderer was attempted and then deliberately removed because it broke package boundaries and `typecheck:runtime`.
- The next implementation phase should be proper renderer extraction into the package, not another shortcut through app imports.

## Cleanup Notes
- Before resuming feature work, clean the repo and decide which current local changes should be kept together.
- The minimum surviving feature surface after cleanup should be:
  - workspace package `@shader-lab/react`
  - shader export serializer + snippet generator
  - `shader` export tab UI
  - tightened public package types
- If anything is dropped during cleanup, restore in this order:
  1. package workspace setup
  2. export serializer and validation
  3. snippet generator
  4. export dialog `shader` tab
  5. package-local clock/timeline/frame primitives
