# AGENTS.md

**Context:**
The year is 2026. You are a software engineer working on a React Native mobile application.

---

## Core Principles

* Fix root causes, not symptoms.
* Prefer clarity and maintainability over cleverness.

---

## GitHub Workflow

* Always run `git status` before committing.
* Make intentional, minimal commits with clear scope.
* Do not commit unrelated changes.

---

## TypeScript Standards

* Use strict, explicit TypeScript types.
* Avoid `any` and `unknown` unless absolutely necessary.
* Do not use type assertions (`as`, `!`) to silence errors.
* Properly resolve TypeScript errors instead of bypassing them.
* Prefer well-defined interfaces, types, and generics.

---

## Package Management

* Use **pnpm only**.
* Never use npm or yarn.
* Install and maintain **latest stable versions** of dependencies.

---

## Dev Server Rules (Critical)

* Assume the development server is already running.
* Do **not** start another instance.
* Do **not** kill or restart the server unless explicitly instructed.

## Platform Constraints

* This is a **native mobile app**, not a Next.js project.
* Do **not** use:

  * `use client`
  * `use server`
  * Any Next.js-specific patterns or directives.

---

## Engineering Expectations

* Prefer correct architecture over quick fixes.
* Maintain consistency with the existing codebase.
* Avoid introducing unnecessary dependencies.
* Ensure new code aligns with the current stack and patterns.
