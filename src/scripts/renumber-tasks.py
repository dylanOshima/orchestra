#!/usr/bin/env python3
"""
renumber-tasks.py – handle ID collision in tasks.jsonl shared protocol
Usage:
  python3 renumber-tasks.py <tasks_file> [--check] [--fix] [--second-file <path>]

Modes:
- --check: warn on duplicate IDs, non-sequential, invalid JSON
- --fix: deduplicate IDs in place, renumber second occurrences to max+1 and rewrite deps
- --second-file: merge two files – keep first file's IDs, renumber second's colliding IDs to continue sequence

Shared protocol: IDs T001... file-wide sequential, never per-feature reset. Dependencies reference IDs.
On concurrent append, both sides may claim same range. This script mechanically keeps both sides,
renumbering later side.

Examples:
  python3 renumber-tasks.py docs/mvp/tasks.jsonl --check
  python3 renumber-tasks.py docs/mvp/tasks.jsonl --fix
  python3 renumber-tasks.py docs/mvp/tasks.jsonl --second-file incoming/tasks.jsonl --output merged/tasks.jsonl
"""

import json
import sys
import argparse
from pathlib import Path
from collections import defaultdict

def load_tasks(file_path):
    tasks = []
    errors = []
    with open(file_path, 'r', encoding='utf-8') as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                t = json.loads(line)
                t['_lineno'] = lineno
                t['_raw'] = line
                tasks.append(t)
            except Exception as e:
                errors.append(f"Line {lineno}: {e}")
    return tasks, errors

def get_id_num(id_str):
    try:
        return int(id_str.lstrip('T'))
    except:
        return -1

def renumber_tasks(tasks, start_num=1):
    """Renumber tasks sequentially starting from start_num, return (renumbered_tasks, old->new map)"""
    old_to_new = {}
    renumbered = []
    next_num = start_num
    for t in tasks:
        old_id = t.get('id', f'T{next_num:03d}')
        new_id = f'T{next_num:03d}'
        if old_id != new_id:
            old_to_new[old_id] = new_id
        t_copy = dict(t)
        t_copy['id'] = new_id
        t_copy.pop('_lineno', None)
        t_copy.pop('_raw', None)
        renumbered.append(t_copy)
        next_num += 1
    # rewrite dependencies using map
    for t in renumbered:
        if 'dependencies' in t and t['dependencies']:
            t['dependencies'] = [old_to_new.get(dep, dep) for dep in t['dependencies']]
    return renumbered, old_to_new, next_num

def merge_two_files(first_path, second_path, output_path=None):
    first_tasks, first_errors = load_tasks(first_path)
    second_tasks, second_errors = load_tasks(second_path)

    errors = first_errors + second_errors
    if errors:
        print("Parse errors:", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)

    # Find max ID in first file
    max_num = 0
    existing_ids = set()
    for t in first_tasks:
        existing_ids.add(t.get('id'))
        n = get_id_num(t.get('id', ''))
        if n > max_num:
            max_num = n

    # Renumber second file starting at max+1, but handle collisions within second file too
    old_to_new = {}
    next_num = max_num + 1
    renumbered_second = []

    # Check for internal duplicates in second file as well
    seen_in_second = set()
    for t in second_tasks:
        old_id = t.get('id')
        # If old_id collides with first file or already seen in second, renumber
        if old_id in existing_ids or old_id in seen_in_second:
            new_id = f'T{next_num:03d}'
            old_to_new[old_id] = new_id
            print(f"Renumbering colliding {old_id} -> {new_id}", file=sys.stderr)
            t = dict(t)
            t['id'] = new_id
            next_num += 1
        else:
            # Keep original but still advance next_num if this ID would conflict with future sequential?
            # For simplicity, ensure next_num is at least max(old)+1
            n = get_id_num(old_id) if old_id else -1
            if n >= next_num:
                next_num = n + 1
        t_copy = dict(t)
        t_copy.pop('_lineno', None)
        t_copy.pop('_raw', None)
        renumbered_second.append(t_copy)
        seen_in_second.add(old_id)
        existing_ids.add(t_copy.get('id'))

    # Rewrite dependencies in second file using old->new map
    for t in renumbered_second:
        if 'dependencies' in t and t['dependencies']:
            t['dependencies'] = [old_to_new.get(dep, dep) for dep in t['dependencies']]

    merged = first_tasks + renumbered_second
    # Strip internal keys from first_tasks
    for t in merged:
        t.pop('_lineno', None)
        t.pop('_raw', None)

    output = output_path or first_path
    # If output is first_path, we overwrite with merged; if different, write new
    with open(output, 'w', encoding='utf-8') as f:
        for t in merged:
            # first_tasks still have _ keys stripped above, but we need to ensure they were stripped
            # Re-load clean from original to avoid losing fields? We already stripped.
            # For first_tasks, ensure no _ keys
            clean = {k: v for k, v in t.items() if not k.startswith('_')}
            f.write(json.dumps(clean) + '\n')

    print(f"Merged {len(first_tasks)} + {len(second_tasks)} -> {len(merged)} tasks into {output}")
    if old_to_new:
        print(f"Renumber map: {old_to_new}")

    return merged

def check_file(file_path):
    tasks, errors = load_tasks(file_path)
    if errors:
        print(f"FAILED: {len(errors)} parse errors in {file_path}:")
        for e in errors:
            print(f"  {e}")
        return False

    ids = [t.get('id') for t in tasks]
    dup = [id for id in set(ids) if ids.count(id) > 1]
    if dup:
        print(f"WARNING: duplicate IDs in {file_path}: {dup}")
        return False

    # Check sequential (allow gaps but warn if not starting at 1?)
    nums = sorted([get_id_num(id) for id in ids if get_id_num(id) != -1])
    if nums and nums[0] != 1:
        print(f"WARNING: IDs don't start at T001, first is T{nums[0]:03d}")
    # Check gaps
    expected = list(range(1, max(nums)+1)) if nums else []
    missing = [n for n in expected if n not in nums]
    if missing:
        print(f"WARNING: missing IDs in sequence: {[f'T{n:03d}' for n in missing]}")

    # Check dependencies point to existing IDs
    existing = set(ids)
    for t in tasks:
        for dep in t.get('dependencies', []):
            if dep not in existing:
                print(f"WARNING: task {t.get('id')} depends on {dep} which doesn't exist")

    print(f"PASSED: {len(tasks)} tasks in {file_path}, no duplicate IDs, {len(errors)} parse errors")
    return True

def fix_file(file_path):
    tasks, errors = load_tasks(file_path)
    if errors:
        print(f"Cannot fix – parse errors present: {errors}", file=sys.stderr)
        return False

    # Deduplicate by keeping first occurrence, renumbering subsequent duplicates
    seen = {}
    max_num = 0
    for t in tasks:
        n = get_id_num(t.get('id', ''))
        if n > max_num:
            max_num = n

    next_num = max_num + 1
    old_to_new = {}
    fixed = []
    for t in tasks:
        id_ = t.get('id')
        if id_ in seen:
            new_id = f'T{next_num:03d}'
            old_to_new[id_] = new_id
            print(f"Renumbering duplicate {id_} -> {new_id}", file=sys.stderr)
            t = dict(t)
            t['id'] = new_id
            next_num += 1
        seen[id_] = True
        fixed.append(t)

    # Rewrite dependencies
    for t in fixed:
        if 'dependencies' in t and t['dependencies']:
            t['dependencies'] = [old_to_new.get(dep, dep) for dep in t['dependencies']]

    with open(file_path, 'w', encoding='utf-8') as f:
        for t in fixed:
            clean = {k: v for k, v in t.items() if not k.startswith('_')}
            f.write(json.dumps(clean) + '\n')

    print(f"Fixed {file_path}: {len(fixed)} tasks, renumbered {len(old_to_new)} duplicates")
    if old_to_new:
        print(f"Map: {old_to_new}")
    return True

def main():
    parser = argparse.ArgumentParser(description="Renumber tasks.jsonl for shared protocol")
    parser.add_argument("file", help="Primary tasks.jsonl file")
    parser.add_argument("--check", action="store_true", help="Check for duplicate IDs, validate")
    parser.add_argument("--fix", action="store_true", help="Fix duplicate IDs in place")
    parser.add_argument("--second-file", help="Second file to merge (for append-append conflict)")
    parser.add_argument("--output", help="Output path for merged file (default overwrites first file)")

    args = parser.parse_args()

    if args.check:
        ok = check_file(args.file)
        sys.exit(0 if ok else 1)

    if args.fix:
        ok = fix_file(args.file)
        sys.exit(0 if ok else 1)

    if args.second_file:
        merge_two_files(args.file, args.second_file, args.output)
        sys.exit(0)

    # Default: check
    check_file(args.file)

if __name__ == "__main__":
    main()
