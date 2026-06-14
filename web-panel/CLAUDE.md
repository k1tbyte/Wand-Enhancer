Use these rules as defaults, not as a reason to add ceremonial folders or wrapper layers.

## Core Principles

- Organize code around product capabilities, not framework vocabulary.
- Keep related UI, state, rules, and data access close until a real boundary justifies moving
  them apart.
- Dependencies point from composition and UI toward stable rules and narrow capabilities.
- Protect rendering code from business, state-management, and infrastructure complexity.
- Keep one source of truth and derive everything else.
- Apply KISS, YAGNI, and DRY together. Remove duplicated knowledge, not merely similar syntax.
- Prefer explicit, readable flow over clever abstractions and hidden behavior.

## Screaming Architecture

The repository structure and public APIs should reveal what the product does.

Prefer:

```text
features/
  checkout/
  search/
  account-security/
```

Avoid making the application read primarily as:

```text
components/
hooks/
services/
stores/
utils/
```

Technical folders are useful inside a capability, where their owner is clear. Generic top-level
folders easily become dependency magnets with unclear ownership.

Names should use product language. Prefer `useCheckoutSummary`, `reserveStock`, and
`AccountSecurityPanel` over `useData`, `processItems`, and `GenericPanel`.

## Suggested Structure

Start with the smallest structure that makes ownership obvious:

```text
src/
  app/                 startup, providers, router, global composition
  pages/               route-level composition
  features/
    <capability>/
      index.ts         optional public API
      ui/              optional rendering components
      model/           optional state, view models, decisions
      api/             optional external data access
      lib/             optional feature-local pure helpers
  domains/             optional shared product rules and types
  shared/
    ui/                domain-free visual primitives
    api/               generic transport/query infrastructure
    lib/               genuinely generic pure helpers
```

Folders are created when they contain a real responsibility. A small feature may be one cohesive
file. Do not create empty layers in anticipation of future complexity.

## Dependency Direction

- `app` installs providers, constructs dependencies, and composes the application.
- `pages` compose capabilities for a route. They do not own business rules or data protocols.
- A feature owns one user-recognizable capability end to end.
- Feature UI consumes its own model/view-model API, not raw infrastructure.
- Shared domain code contains reusable product rules and stays independent of React and I/O.
- `shared` contains only domain-free code. Product-specific code is not shared merely because
  two files use it.
- Avoid feature-to-feature imports. Compose features in a page, promote truly shared rules to a
  domain module, or introduce a named workflow when coordination is the actual responsibility.
- Cyclic imports are an architecture problem, not something to solve with a tooling workaround.

For a simple feature, direct `ui -> model -> api` dependencies are sufficient. Introduce ports,
facades, dependency injection, or workflows only when they hide real complexity, enable
important tests, or separate unstable infrastructure.

## Make Composition Read Like The Product

Pages and other composition boundaries should use capability-level APIs.

Prefer:

```tsx
<CheckoutSummary />
<PlaceOrderButton />
```

Over:

```tsx
<Card>
  <Select options={paymentOptions} onChange={handlePaymentChange} />
  <Button onClick={handleSubmit}>Submit</Button>
</Card>
```

The second version makes the page understand checkout behavior and low-level UI configuration.
That knowledge belongs to the checkout capability.

This does not mean wrapping every native element or design-system primitive. Semantic HTML and
visual primitives are correct inside feature UI. Create a capability component when it hides
product behavior or gives composition code a clearer product-level API.

Avoid "raw components" whose consumers must know internal options, state transitions, query
shapes, or protocol details. Avoid generic configuration-driven components that combine
unrelated product modes behind dozens of props.

## UI Boundary

- Components render data and translate DOM events into named user intents.
- Keep business decisions, data mapping, persistence, protocol handling, and multi-step async
  flows outside rendering components.
- UI receives render-ready values. It should not reconstruct domain meaning from raw DTOs.
- Prefer intent props and commands such as `onApprove`, `renameProject`, or `submitOrder` over
  generic `onChange`, `setState`, or `patch` APIs at capability boundaries.
- Keep ephemeral visual state local: focus, hover, open/closed, and uncommitted input usually
  belong in the component.
- Split components by responsibility and API clarity, not by arbitrary line limits.
- Prefer slots and composition over components with many layout modes and boolean props.
- Use semantic HTML and preserve accessibility behavior.

A view-model hook is useful when it protects UI from state shape, async coordination, or business
decisions. Do not create a pass-through hook that only renames one value to satisfy a diagram.

## State Ownership

Choose the smallest correct owner:

| State | Preferred owner |
| --- | --- |
| Ephemeral visual state | local component state |
| Uncommitted form state | the form or feature |
| URL/shareable navigation state | the router/URL |
| Remote server resource and cache | a query/cache layer |
| Shared capability state | that feature's model/store |
| Cross-capability process | a named workflow or app-level model |

- A store is not a bucket for every value used by several components.
- Split state by capability and lifecycle, not by data type.
- Expose narrow selectors, hooks, or commands. Do not expose a complete mutable store to all UI.
- Store transitions should express user or domain intent, not generic object mutation.
- Derive values instead of storing synchronized copies.
- Do not use effects to keep two pieces of application state synchronized.
- React Context is suitable for dependency injection or stable scoped state. Avoid one broad
  app context whose every update rerenders unrelated consumers.

State-library choice is an implementation detail. Architecture should survive replacing it
without rewriting pages and rendering components.

## Effects And Async Work

- Use effects to synchronize with external systems, not to calculate render data or handle user
  events.
- Start event-driven work from the event or model command that owns it.
- Every subscription, timer, listener, or in-flight operation must have a clear owner and
  cleanup path.
- The owning feature/model defines pending, success, empty, error, retry, and cancellation
  semantics.
- Prevent stale async results and race conditions where users can trigger overlapping work.
- Do not hide failures with broad `catch` blocks or silently convert errors into empty data.

## Data And Infrastructure

- Treat network responses, storage, URL input, files, and third-party SDK output as untrusted.
- Validate and normalize data at the boundary where it enters the application.
- Map transport DTOs and external errors into product-oriented values before they reach UI.
- Keep raw `fetch`, storage APIs, SDK calls, and protocol details out of rendering components.
- Keep a feature-specific API adapter inside the feature until it has a real shared consumer.
- Introduce a client, repository, gateway, service, or facade only when its responsibility is
  distinct and useful.
- Avoid wrapper chains that only forward calls. One clear adapter is better than
  `Client -> Service -> Facade` without separate responsibilities.
- Inject infrastructure when tests, multiple implementations, lifecycle, or unstable external
  APIs justify it. Do not introduce dependency injection for every pure helper.

## Component And Hook APIs

- Component and hook APIs describe product intent, not internal implementation.
- Avoid boolean prop combinations that create unclear or invalid modes. Prefer explicit variants
  or separate components.
- Avoid passing raw query results, stores, SDK clients, or large configuration objects through
  component trees.
- Keep public props small and cohesive. A component that needs unrelated groups of props likely
  owns too many responsibilities.
- Custom hooks encapsulate React state, lifecycle, or reusable reactive behavior. Pure
  calculations remain plain functions.
- Do not use `useEffect`, `useMemo`, `useCallback`, or `memo` by habit. Use them for correctness
  or measured performance needs.
- Do not duplicate server or domain state into component state merely to make it editable.
  Create an explicit draft only when the UX requires commit/cancel semantics.

## Public Boundaries

- Export the smallest useful public surface of a feature.
- Consumers should use a feature's public components, hooks, commands, and types, not deep
  internal paths.
- Keep implementation-only state, DTOs, adapters, and helpers private.
- Do not create barrel files everywhere. Use a public entry point only where a real boundary
  exists.
- A reusable abstraction should have a clear owner and at least one current reason to exist.
- Avoid generic `core`, `common`, `helpers`, `services`, or `utils` modules that collect
  unrelated responsibilities.

## Growing The Architecture

Start local and promote code only after pressure appears:

- A second consumer may justify shared domain code, but similar code is not automatically the
  same knowledge.
- Repeated external integration logic may justify a shared adapter.
- A process coordinating several capabilities may justify a named workflow.
- A large feature may split into smaller capabilities when they have distinct responsibilities
  and lifecycles.
- Separate packages are useful when an enforceable boundary, independent reuse, or independent
  lifecycle outweighs their maintenance cost.

Do not begin a small application with every possible layer, package, provider, repository,
facade, and design pattern. Strong architecture makes growth cheaper; it does not predict every
future requirement.

## Testing

- Test product behavior and public contracts, not implementation trivia.
- Test pure rules with unit tests.
- Test feature models and async transitions without rendering where practical.
- Test components through accessible user behavior.
- Test infrastructure mapping and validation at external boundaries.
- Keep end-to-end tests for critical user journeys.
- Mock external systems and unstable boundaries, not every internal function.
- Add tests proportional to risk, especially for validation, permissions, races, retries,
  cancellation, and regressions.

## Review Checklist

Before finishing a change, ask:

- Does the file location make its owner obvious?
- Does composition code read in product language?
- Is UI protected from raw state, DTOs, infrastructure, and business decisions?
- Is there one source of truth?
- Are effects only synchronizing external systems?
- Is new shared code genuinely domain-free or genuinely shared?
- Does every abstraction remove current complexity?
- Can important behavior be tested without rendering the whole app?
- Did the change preserve accessibility, error handling, and cleanup?
- Is this the least code that clearly solves the current problem?
