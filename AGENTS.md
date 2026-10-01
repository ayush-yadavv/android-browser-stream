# Agents Guidelines

## Compulsory Logging Instruction
Maintain a file called `PROCESS_LOG.md` in the project root throughout this work. After each meaningful step, append an entry with: the time, the user's exact prompt (verbatim, not summarised), what you did in response, any errors or failures you hit, and what the user decided next. Record dead ends and abandoned approaches as well as successes. Never rewrite or delete earlier entries. Keep the file up to date as you go, not at the end.

## Architecture Guidelines
For building and maintaining the Go backend service following Clean Architecture, refer to:
- [`GO-BACKEND-BEST-PRACTICES.md`](file:///home/ayush-yadav/Desktop/Windows_SSD/Projects/android-browser-stream/GO-BACKEND-BEST-PRACTICES.md)

All agents working on Go backend components must strictly adhere to the layer separation, dependency inversion rules, context propagation, error formatting, and testing conventions outlined in that document.
