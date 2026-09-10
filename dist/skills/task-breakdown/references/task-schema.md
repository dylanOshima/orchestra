# MVP Task Schema Reference

Full documentation for the `tasks.jsonl` task format used by MVP.

## File Format

`docs/mvp/tasks.jsonl` is a JSON Lines file: one valid JSON object per line, no trailing commas, UTF-8 encoded. Each line represents exactly one task.

```
{"id": "T001", "feature": "user-auth-jwt", "complexity": "low", "goal": "...", "success_criteria": "...", "status": "open", "dependencies": [], "resources": []}
{"id": "T002", "feature": "user-auth-jwt", "complexity": "medium", "goal": "...", "success_criteria": "...", "status": "open", "dependencies": ["T001"], "resources": []}
```

## Field Reference

### `id` (string, required)

Unique task identifier. Format: `T` followed by a zero-padded 3-digit number.

- Valid: `T001`, `T002`, `T010`, `T100`
- Invalid: `1`, `task-1`, `T1`, `T0001`

IDs are assigned sequentially in the order tasks are created, **file-wide across all features**. New tasks appended by sub-agents or later feature breakdowns continue the sequence (e.g., if the file ends at T007, new tasks start at T008). Never restart numbering for a new feature.

---

### `feature` (string, required)

Kebab-case slug of the feature this task belongs to, derived from the spec topic. The tasks.jsonl file grows across the project's lifetime; this field is how tasks are grouped into features and how the orchestrator scopes an execution run.

- Valid: `user-authentication-jwt`, `real-time-notifications`
- One feature per brainstormed spec; all tasks from one breakdown share the same slug
- The orchestrator only executes tasks whose `feature` matches its assigned feature

---

### `goal` (string, required)

A single sentence describing what this task accomplishes. Written in the imperative: "Add X", "Implement Y", "Update Z".

Good examples:
- `"Add POST /api/users endpoint that creates a new user record"`
- `"Write unit tests for the UserService.create() method"`
- `"Update the database schema to add an email_verified column to the users table"`

Bad examples:
- `"User creation"` — not a sentence, unclear what action is taken
- `"Add user creation endpoint and validation and tests"` — too much scope
- `"Fix the thing"` — vague

---

### `success_criteria` (string, required)

A specific, verifiable statement of what passing looks like. Must be checkable without human judgment.

Good patterns:
- **Test pass:** `"Running 'pytest tests/test_users.py::test_create_user' exits 0"`
- **File exists with content:** `"File src/users/handler.ts exists and exports a createUser function"`
- **API response:** `"POST /api/users with valid body returns HTTP 201 and a JSON body containing an 'id' field"`
- **Build passes:** `"'npm run build' exits 0 with no TypeScript errors"`
- **Migration runs:** `"'alembic upgrade head' applies migration 0012 without error"`

Bad patterns:
- `"The endpoint works correctly"` — unverifiable
- `"Code looks clean"` — subjective
- `"Tests pass"` — which tests?

---

### `status` (string, required)

Current execution state of the task. One of:

| Value | Meaning |
|-------|---------|
| `open` | Not yet started; all prerequisites met or none required |
| `in_progress` | A sub-agent is actively working on this task |
| `closed` | Task is complete and success criteria have been verified |
| `blocked` | Cannot proceed due to a failed dependency or external blocker |

The orchestrator updates status to `in_progress` when assigning a task, and to `closed` after merging the completed worktree. The task-executor updates its own task to `closed` in its local copy of the tasks.jsonl before committing.

---

### `complexity` (string, optional, default `"medium"`)

How hard the task is, which decides the model that executes it. One of:

| Value | Meaning | Default model |
|-------|---------|---------------|
| `low` | Mechanical: clear pattern, 1–2 files, trivially checkable | `haiku` |
| `medium` | Standard feature work with some design freedom | `sonnet` |
| `high` | Novel logic, coordination, subtle state — wrong approaches are expensive | inherit (session model) |

The mapping is configurable via the `models` key in `.claude/mvp.local.md` (see the configuring-mvp skill). A task without a `complexity` field is treated as `medium`. The orchestrator escalates one tier when re-dispatching a task whose executor got stuck or failed.

---

### `dependencies` (array of strings, required)

List of task IDs that must be `closed` before this task can be assigned. Empty array means the task is immediately runnable.

```json
"dependencies": []           // no dependencies, ready to start
"dependencies": ["T001"]     // must wait for T001
"dependencies": ["T002", "T003"]  // must wait for both T002 and T003
```

Rules:
- Only list tasks whose output is literally needed as input to this task
- Do not add dependencies for "logical ordering" — if two tasks can run in any order, they are independent
- No cycles (the orchestrator validates this at startup)

---

### `resources` (array of strings, required)

Everything a sub-agent needs to complete this task without asking questions. Can include:

**File paths** (relative to project root):
```json
"src/api/users/handler.ts"
"src/models/user.model.ts"
"tests/api/users.test.ts"
```

**Plan file references** (to specific sections):
```json
"docs/mvp/specs/2026-08-24-user-auth-design.md"
"docs/mvp/specs/2026-08-24-user-auth-design.md#Proposed-Approach"
```

**External URLs** (documentation, API specs):
```json
"https://docs.example.com/api-reference"
```

**Directory paths** (when the agent needs to understand the broader structure):
```json
"src/api/"
"tests/"
```

Always include:
- Every file the task needs to read or modify
- The plan file (or relevant section)
- Any external docs for APIs or schemas being used

Do not include:
- Files the task will create (they don't exist yet)
- General-purpose files like package.json unless specifically relevant

---

## Lifecycle: New Tasks from Sub-Agents

When a task-executor discovers new tasks during implementation, it signals them via the Claude Task metadata field `new_tasks`. Each entry is a partial task object (no `id` or `status` — the orchestrator assigns those):

```json
[
  {
    "goal": "Add input validation middleware for the /api/users route",
    "success_criteria": "POST /api/users with missing 'email' field returns HTTP 422",
    "dependencies": ["T004"],
    "resources": ["src/api/users/handler.ts", "src/middleware/"]
  }
]
```

The orchestrator appends these to the tasks.jsonl with sequential IDs and `status: "open"`.

---

## Complete Example

```jsonl
{"id": "T001", "feature": "user-auth-jwt", "complexity": "low", "goal": "Add users table migration", "success_criteria": "Running 'alembic upgrade head' applies migration 0010_add_users without error and 'alembic current' shows 0010", "status": "open", "dependencies": [], "resources": ["alembic/versions/", "src/models/", "docs/mvp/specs/2026-08-24-user-auth-design.md#Proposed-Approach"]}
{"id": "T002", "feature": "user-auth-jwt", "complexity": "medium", "goal": "Implement User model with SQLAlchemy", "success_criteria": "File src/models/user.py exists, defines a User class with id/email/hashed_password fields, and 'python -c \"from src.models.user import User\"' exits 0", "status": "open", "dependencies": ["T001"], "resources": ["src/models/", "src/database.py", "docs/mvp/specs/2026-08-24-user-auth-design.md"]}
{"id": "T003", "feature": "user-auth-jwt", "complexity": "medium", "goal": "Add POST /api/users endpoint", "success_criteria": "pytest tests/api/test_users.py::test_create_user passes", "status": "open", "dependencies": ["T002"], "resources": ["src/api/users/", "src/models/user.py", "tests/api/test_users.py", "docs/mvp/specs/2026-08-24-user-auth-design.md#Proposed-Approach"]}
{"id": "T004", "feature": "user-auth-jwt", "complexity": "low", "goal": "Add GET /api/users/{id} endpoint", "success_criteria": "pytest tests/api/test_users.py::test_get_user passes", "status": "open", "dependencies": ["T002"], "resources": ["src/api/users/", "src/models/user.py", "tests/api/test_users.py"]}
{"id": "T005", "feature": "user-auth-jwt", "complexity": "medium", "goal": "Write integration tests for user CRUD flow", "success_criteria": "pytest tests/integration/test_user_crud.py exits 0 with all tests passing", "status": "open", "dependencies": ["T003", "T004"], "resources": ["tests/integration/", "src/api/users/", "docs/mvp/specs/2026-08-24-user-auth-design.md"]}
```
