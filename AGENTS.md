# Agents Guidelines
### Core Principles

- **YAGNI with seams**: Don't build what you don't need, but design so it's easy to extend later. Leave doors unlocked, don't build the rooms.

- **DRY, pragmatically**: Duplication is cheaper than the wrong abstraction. Extract only when the pattern is proven (rule of three) and the abstraction is obvious.

- **SOLID, OOPs, Clean Architecture**: Write clean code to reduce future hassle.

- **Unix Philosophy**: Small, focused modules that compose well.

- **Explicit Dependencies & Contracts**: Define clear interface contracts and use explicit dependency injection over implicit conventions or hidden global state.

- **Domain-Driven Design**: Code should speak the language of the business. Model explicitly.

### Security (Top Priority)

- **OWASP Top 10**: Always guard against SQL injection, XSS, CSRF, broken auth, security misconfigs.
- **Injection prevention**: Never concatenate user input into database queries or shell commands. Use structured BSON filters and MongoDB driver builders (or parameterized queries for SQL).
- **Validate at boundaries**: Sanitize all external input (user input, APIs, webhooks).
- **Least privilege**: Minimal permissions, minimal exposure.
- **No secrets in code**: Use environment variables. Never log secrets.
- **Remove obsolete code**: Dead code is attack surface. Delete it.

### Architecture
- **Server as Business Logic & Orchestration Hub**: The browser client application is strictly for presentation (rendering stream via WebCodecs/MSE/WebRTC and capturing normalized input). **Keep all business logic, session management, container lifecycle orchestration, and input translation on the server.**


### Testing Philosophy

- **Integration tests first**: Test real behavior with real dependencies.
- **Minimal mocking**: Mocks hide bugs. Use the real thing where possible.
- **Test behavior, not implementation**: Tests should survive refactors.
- **Critical paths over coverage %**: Focus on what matters, not vanity metrics.

### Guidelines

- Prefer simple code that's easy to change over clever code that's "flexible".
- Adhere strictly to Clean Architecture layer separation: controllers remain thin, use cases encapsulate business workflows, and repositories handle persistence.
- Design clean seams between components so modules can be extended or replaced without cascading changes.

## Architecture Guidelines
For building and maintaining the Go backend service following Clean Architecture, refer to:
- [`GO-BACKEND-BEST-PRACTICES.md`](file:///mnt/Projects/android-browser-stream/GO-BACKEND-BEST-PRACTICES.md)

All agents working on Go backend components must strictly adhere to the layer separation, dependency inversion rules, context propagation, and error formatting outlined in that document, while adhering to the integration-first, minimal-mocking testing philosophy above.
