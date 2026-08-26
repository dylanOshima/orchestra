/**
 * Orchestra tasks tool – standalone version for .opencode/tools discovery
 * Same logic as in src/index.ts, but as individual tool file for filesystem discovery.
 * Filename = tool name, so this registers as `orchestra-tasks` (dash) which OpenCode maps to underscore? 
 * Prefer plugin.tool registration as `orchestra_tasks` – this file is for reference / local override.
 */

import { tool } from "@opencode-ai/plugin";
import path from "path";
import fs from "fs";

export default tool({
  description: "Manage orchestra tasks.jsonl – shared protocol across harnesses. Read, append, update-status, list, validate.",
  args: {
    action: tool.schema.enum(["read", "append", "update-status", "list", "validate"]),
    artifacts_dir: tool.schema.string().optional(),
    feature: tool.schema.string().optional(),
    task_json: tool.schema.string().optional(),
    file_path: tool.schema.string().optional(),
  },
  async execute(args, ctx) {
    const artifactsDir = args.artifacts_dir || "docs/mvp";
    const tasksFile = args.file_path || path.join(artifactsDir, "tasks.jsonl");
    const resolved = path.isAbsolute(tasksFile) ? tasksFile : path.join(ctx.directory, tasksFile);

    const ensureDir = () => {
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    };

    try {
      if (args.action === "read" || args.action === "list" || args.action === "validate") {
        if (!fs.existsSync(resolved)) return `tasks.jsonl not found at ${resolved}`;
        const raw = fs.readFileSync(resolved, "utf8");
        const lines = raw.split("\n").filter((l) => l.trim());
        let tasks: any[] = [];
        let errors: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          try {
            tasks.push(JSON.parse(lines[i]));
          } catch (e) {
            errors.push(`Line ${i + 1}: ${(e as Error).message}`);
          }
        }
        let filtered = args.feature ? tasks.filter((t) => t.feature === args.feature) : tasks;
        if (args.action === "validate") {
          if (errors.length) return `FAILED: ${errors.join("; ")}`;
          const ids = filtered.map((t) => t.id);
          const dup = ids.filter((id, idx) => ids.indexOf(id) !== idx);
          if (dup.length) return `WARNING duplicate IDs ${[...new Set(dup)].join(",")}`;
          return `PASSED: ${filtered.length} tasks`;
        }
        if (args.action === "read") return JSON.stringify(filtered, null, 2);
        const counts: Record<string, number> = {};
        for (const t of filtered) counts[t.status] = (counts[t.status] || 0) + 1;
        const ready = filtered.filter((t) => t.status === "open" && (t.dependencies || []).every((dep: string) => tasks.find((x) => x.id === dep)?.status === "closed")).length;
        const summary = `Feature:${args.feature || "all"} File:${resolved} Tasks:${filtered.length} (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}) Ready:${ready}`;
        const list = filtered.map((t) => `[${t.id}] ${t.status} ${t.goal}`).join("\n");
        return `${summary}\n\n${list}`;
      }

      if (args.action === "append") {
        if (!args.task_json) return "append requires task_json";
        ensureDir();
        let newTasks: any[];
        try {
          const parsed = JSON.parse(args.task_json);
          newTasks = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return "Invalid task_json";
        }
        let maxId = 0;
        if (fs.existsSync(resolved)) {
          const raw = fs.readFileSync(resolved, "utf8");
          for (const line of raw.split("\n").filter((l) => l.trim())) {
            try {
              const t = JSON.parse(line);
              const n = parseInt(t.id.replace(/^T/, ""), 10);
              if (!isNaN(n) && n > maxId) maxId = n;
            } catch {}
          }
        }
        const appended: any[] = [];
        for (const nt of newTasks) {
          maxId++;
          appended.push({
            id: `T${String(maxId).padStart(3, "0")}`,
            feature: args.feature || nt.feature || "unknown",
            goal: nt.goal,
            success_criteria: nt.success_criteria,
            status: "open",
            dependencies: nt.dependencies || [],
            resources: nt.resources || [],
            complexity: nt.complexity || "medium",
          });
        }
        fs.appendFileSync(resolved, appended.map((t) => JSON.stringify(t)).join("\n") + "\n");
        return `Appended ${appended.length}: ${appended.map((t) => t.id).join(", ")}`;
      }

      if (args.action === "update-status") {
        if (!args.task_json) return "update-status needs {id,status}";
        let payload: any;
        try {
          payload = JSON.parse(args.task_json);
        } catch {
          return "Invalid JSON";
        }
        const { id, status } = payload;
        if (!fs.existsSync(resolved)) return "not found";
        const lines = fs.readFileSync(resolved, "utf8").split("\n").filter((l) => l.trim());
        let found = false;
        const updated = lines.map((line) => {
          try {
            const t = JSON.parse(line);
            if (t.id === id) {
              found = true;
              t.status = status;
              return JSON.stringify(t);
            }
            return line;
          } catch {
            return line;
          }
        });
        if (!found) return `Task ${id} not found`;
        fs.writeFileSync(resolved, updated.join("\n") + "\n");
        return `Updated ${id} → ${status}`;
      }

      return `Unknown action ${args.action}`;
    } catch (e) {
      return `Error: ${(e as Error).message}`;
    }
  },
});
