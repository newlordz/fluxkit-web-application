Verify and ensure that all 37 tools in the FluxKit web application work as intended, testing each tool one by one and resolving any issues before moving to the next.

Integrity mode: development

## Verification Resources
- Existing test suites in the `tests/` directory and test configuration in `package.json`

## Requirements

### R1. Sequential verification of all 37 tools
Iterate through all 37 tools defined in the application one by one. For each tool, inspect its functionality, UI state, and user interactions to verify whether it works as intended.

### R2. Immediate fix before advancing
If any tool does not work as intended, lacks an active implementation, or encounters errors, fix and verify that tool completely before moving on to test the next tool.

### R3. Client-side interactive processing
For tools requiring external services or backend APIs (such as AI text tools, audio transcription, or document format conversions), implement client-side functionality or in-browser fallback/simulated processing so that every tool operates interactively within the web app.

## Acceptance Criteria

### Tool Functionality & Flow
- [ ] Each of the 37 tools in `src/config.ts` is accessible and interactively usable in the user interface.
- [ ] Each tool accepts appropriate input and produces valid output or feedback without unhandled runtime exceptions.
- [ ] Tools with external dependencies provide client-side or in-browser fallback processing to ensure complete interactive workflows.
- [ ] Verification and fixes occur sequentially, resolving each tool's defects before advancing to the next.

### Build & Test Health
- [ ] The project builds successfully with no TypeScript compilation or bundling errors.
- [ ] Existing automated tests in the repository pass with no regressions.
