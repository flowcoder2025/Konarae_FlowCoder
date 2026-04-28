# Lessons

- [2026-04-28] Failure mode: Task 5 re-ran `analyzeProject` for the same approved project to improve evidence output, causing an extra `analysisVersion` increment. Detection signal: implementer reported the project advanced from version `0 → 1` in an abbreviated run and then `1 → 2` in the recorded evidence run. Prevention rule: for remote DB mutation tasks, finalize evidence output before the first mutation; after a successful mutation, use read-only follow-up queries to improve evidence instead of re-running the mutating command.
