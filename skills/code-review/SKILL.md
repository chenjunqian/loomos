---
name: code-review
description: Use this skill for any code review task, including pull request reviews, refactoring suggestions, and code quality analysis.
---

# Code Review Skill

## When to Use
- Reviewing pull requests or code changes
- Analyzing code quality and maintainability
- Identifying security vulnerabilities
- Suggesting refactoring improvements
- Checking code style and best practices

## Review Process

### Step 1: Understand the Context
1. read_file the main files changed to understand the purpose
2. Identify the programming language and framework
3. Note any related files or dependencies

### Step 2: Analyze Code Quality
- Check for code smells (long methods, duplicate code, tight coupling)
- Verify proper error handling
- Ensure meaningful naming conventions
- Look for appropriate separation of concerns

### Step 3: Security Check
- Identify potential injection vulnerabilities
- Check for hardcoded secrets or credentials
- Verify input validation and sanitization
- Ensure proper authentication/authorization patterns

### Step 4: Performance Considerations
- Look for unnecessary database queries
- Check for N+1 query patterns
- Verify proper caching strategies
- Ensure efficient data structures are used

### Step 5: Testing Coverage
- Verify tests exist for critical functionality
- Check test quality and assertions
- Ensure edge cases are covered

## Best Practices for Feedback

### Be Constructive
- Focus on the code, not the person
- Explain why something should be changed
- Suggest improvements with examples
- Acknowledge good decisions and patterns

### Prioritize Issues
1. **Critical**: Security flaws, data loss risks, broken functionality
2. **High**: Performance issues, significant maintainability problems
3. **Medium**: Code style, minor improvements
4. **Low**: Suggestions, nice-to-have improvements

### Format Your Review
```
## Summary
Brief overview of the review

## Critical Issues
- [ ] Issue description with severity

## Suggested Changes
```language
// Suggested code
```

## Strengths
- What's working well
```

## Common Patterns to Look For

### Good Patterns (Praise These)
- Proper dependency injection
- Defensive programming
- Comprehensive error handling
- Clean separation of concerns
- Meaningful commit messages

### Anti-Patterns (Flag These)
- God objects/classes
- Deep nesting (if/else chains)
- Magic numbers and strings
- Direct database access from controllers
- Ignoring async/await errors
