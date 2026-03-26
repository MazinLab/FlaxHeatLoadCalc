# CLAUDE.md — Project Standards

> Loaded automatically on every interaction. Contains shared values, code standards, and environment config.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- For tasks below the plan-mode threshold, do a silent design pass before writing code: identify the problem and edge cases, choose the abstraction level, plan the decomposition. No document needed — just think first.

### 2. Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- For non-trivial changes: pause and ask "is there a more elegant way?"
- Run tests, check logs, demonstrate correctness
- **Pre-delivery self-check**: silently verify all functions are called, all imports present and used, all names consistent, tests pass conceptually, code would run in a fresh py313 environment

### 5. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them independently

### 6. Interaction Mode
- Default: LOW-INTERACTION. Make reasonable assumptions, state them briefly, deliver working code.
- **Pause and ask** (one focused question with a recommended option) only when a decision would:
  - Fundamentally change the architecture (e.g., sync vs async, CLI vs API vs GUI)
  - Lock in a dependency that's hard to swap later (e.g., database choice, web framework)
  - Affect how other people or systems interface with the code
  - Involve an ambiguous tradeoff the user likely has an opinion on
- If no answer comes, proceed with the recommendation.

## Engineering Values

These govern all code I write and all code I review. Ordered by priority when values conflict:

1. **Correctness first** — code that doesn't work right is worthless regardless of how clean it is.
2. **Explicit over clever** — always. If it requires a comment to explain *what* it does, rewrite it.
3. **Edge cases matter** — handle more, not fewer. Thoughtfulness > speed.
4. **DRY is load-bearing** — flag repetition aggressively. Every piece of knowledge gets one authoritative representation: literals → constants, logic → shared functions, patterns → abstractions, config values → constants/config objects.
5. **Well-tested code is non-negotiable** — too many tests beats too few. Every public function gets tests. Every error path gets tests. Edge cases get tests.
6. **"Engineered enough"** — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity). When in doubt, err toward simplicity — it's easier to add abstraction later than to remove it.

## Programming Principles

### YAGNI + KISS
Implement what is asked for. No speculative features or "just in case" abstractions. Make code *easy to extend later* through clean interfaces without actually extending it now. The simplest correct solution wins. If a domain-knowledgeable developer can't follow it in 60 seconds, simplify.

### SOLID (pragmatically)
Each function does one thing. Prefer composition over inheritance. Inject dependencies — don't hardcode I/O, APIs, or database access. Keep interfaces narrow. Don't over-engineer for imaginary futures.

### Defensive Programming
Validate inputs at system boundaries. Use guard clauses and early returns. Fail fast and loudly — never silently swallow errors. Leverage the type system as your first line of defense.

### Separation of Concerns
I/O is separate from logic. Parsing is separate from processing. Config is separate from code. Functions that compute should not also print, write files, or make network calls.

## Code Standards

### Structure
- Module-level docstring: WHAT and WHY (not HOW).
- Imports organized: stdlib → third-party → local, with blank line separators.
- Constants below imports. Public API before private helpers.
- Functions ~50 lines as a guideline; up to 200 or more with justification (complex scientific solvers, parsers, state machines, domain-complex logic).

### Naming
- Names reveal intent: `parse_resonator_frequencies()` not `process_data()`.
- Booleans read as assertions: `is_valid`, `has_permission`, `should_retry`.
- Collections are plural. Naming is consistent across the codebase.

### Functions
- Typed parameters and return values. Limit to 3–4 args; group related params into a dataclass.
- No flag parameters that change behavior — split into two functions.
- Docstrings on public functions: summary, params, returns, raises.

### Error Handling
- Library code: raise specific named exceptions, never print.
- Application code: catch at boundaries, log with context.
- Scripts: catch at top level, useful error messages, appropriate exit codes.
- Custom exceptions for domain errors. Never bare `Exception`.
- Error messages: what was attempted, what went wrong, what to do about it.

### Comments
- Code is self-documenting through naming. Comments explain WHY.
- No commented-out code. TODOs include reason and context.
- When a decision blocks part of an implementation, mark it: `# BLOCKED: awaiting decision on [specific question]`. Never fill blocked sections with guesses.

### Testing
- pytest as the default framework. Tests live in a `tests/` directory mirroring the source structure.
- Test names describe the behavior: `test_parse_resonator_raises_on_negative_frequency`.
- One assertion per test concept (multiple asserts are fine if testing one logical thing).
- Use fixtures and parametrize for repetition. No test interdependence.
- Cover: happy path, edge cases, error paths, boundary conditions.
- Integration tests are separate from unit tests and clearly labeled.

## Python Standards

- Type hints on ALL signatures and class attributes. Use `from __future__ import annotations` for forward references.
- Use modern syntax: match/case, `X | Y` union types, walrus operator where clear.
- Dataclasses or Pydantic for structured data. No raw dicts for domain objects.
- pathlib for paths. logging instead of print for operational output. f-strings for formatting.
- Context managers for resource management. enumerate/zip/comprehensions idiomatically — but no nested comprehensions beyond one level.
- `set -euo pipefail` equivalent: always handle subprocess errors.
s
## Scientific Computing Addendum

When code involves numerical or scientific work:
- Be explicit about units in variable names or docstrings (e.g., `frequency_ghz`, `separation_au`).
- Guard against floating-point edge cases: division by zero, NaN propagation, loss of precision in subtraction of similar values.
- Prefer numpy vectorized operations over Python loops for array data.
- Document physical assumptions and reference papers/equations by name.
- Validate array shapes at function entry for non-trivial operations.

## Never Do

- Functions over 50 lines without strong justification
- Single-letter names outside loop counters or domain conventions (x/y for coords, i/j for indices)
- Catch generic exceptions without re-raising or logging
- Mutable default arguments
- Debug print statements in delivered code
- `# type: ignore` without explanation
- Wrapper functions that add no logic
- God classes/functions, global mutable state
- Copy-paste between functions instead of extracting helpers
- Partial code with "rest of implementation here" or "similar to above"

Read @gemkid/code-map.md for context on the MKIDopt project