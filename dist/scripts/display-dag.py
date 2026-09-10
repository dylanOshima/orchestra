#!/usr/bin/env python3
"""
display-dag.py — MVP Task DAG Visualizer

Reads a .prd.jsonl file and renders an ASCII task dependency graph,
organized by topological levels.

Usage: python3 display-dag.py <path-to-prd.jsonl>
"""

import json
import sys
from collections import defaultdict

STATUS_ICON = {
    "open":        "○",
    "in_progress": "◉",
    "closed":      "✓",
    "blocked":     "✗",
}

STATUS_LABEL = {
    "open":        "OPEN",
    "in_progress": "IN PROGRESS",
    "closed":      "CLOSED",
    "blocked":     "BLOCKED",
}


def load_tasks(path):
    tasks = {}
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                t = json.loads(line)
                tasks[t["id"]] = t
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Warning: skipping line {lineno}: {e}", file=sys.stderr)
    return tasks


def compute_levels(tasks):
    """Assign each task to a DAG level (0 = no deps)."""
    levels = {}
    visited = set()

    def get_level(task_id, stack=None):
        if stack is None:
            stack = set()
        if task_id in levels:
            return levels[task_id]
        if task_id not in tasks:
            return -1
        if task_id in stack:
            return 0  # cycle guard
        stack.add(task_id)
        deps = tasks[task_id].get("dependencies", [])
        if not deps:
            levels[task_id] = 0
        else:
            dep_levels = [get_level(d, stack) for d in deps if d in tasks]
            levels[task_id] = 1 + max(dep_levels) if dep_levels else 0
        stack.discard(task_id)
        return levels[task_id]

    for task_id in tasks:
        get_level(task_id)

    return levels


def render_dag(tasks):
    if not tasks:
        print("No tasks found.")
        return

    levels = compute_levels(tasks)
    max_level = max(levels.values(), default=0)

    by_level = defaultdict(list)
    for task_id, level in levels.items():
        by_level[level].append(task_id)

    # Summary counts
    counts = defaultdict(int)
    for t in tasks.values():
        counts[t.get("status", "open")] += 1

    summary_parts = []
    for s in ("open", "in_progress", "closed", "blocked"):
        if counts[s]:
            label = s.replace("_", " ")
            summary_parts.append(f"{counts[s]} {label}")

    width = 68
    print("─" * width)
    total = len(tasks)
    summary = ", ".join(summary_parts) if summary_parts else "0 tasks"
    header = f"  MVP Task DAG  [{total} tasks: {summary}]"
    print(header)
    print("─" * width)

    for level in range(max_level + 1):
        task_ids = sorted(by_level[level])

        if level > 0:
            # Connector arrow between levels
            print()
            print("         │")
            print("         ▼")
            print()

        for task_id in task_ids:
            t = tasks[task_id]
            status = t.get("status", "open")
            icon = STATUS_ICON.get(status, "?")
            label = STATUS_LABEL.get(status, status.upper())

            goal = t.get("goal", "")
            max_goal = 40
            if len(goal) > max_goal:
                goal = goal[:max_goal - 1] + "…"

            deps = t.get("dependencies", [])
            dep_str = f"  ← {', '.join(deps)}" if deps else ""

            print(f"  {icon}  [{task_id}]  {goal:<{max_goal}}  [{label}]{dep_str}")

    print()
    print("─" * width)

    # Show blocked task details
    blocked = [t for t in tasks.values() if t.get("status") == "blocked"]
    if blocked:
        print()
        print("  Blocked tasks:")
        for t in blocked:
            deps = t.get("dependencies", [])
            print(f"    [{t['id']}] waiting on: {', '.join(deps)}")
        print()


def main():
    if len(sys.argv) < 2:
        print("Usage: display-dag.py <path-to-prd.jsonl>", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]

    try:
        tasks = load_tasks(path)
    except FileNotFoundError:
        print(f"Error: File not found: {path}", file=sys.stderr)
        sys.exit(1)

    render_dag(tasks)


if __name__ == "__main__":
    main()
