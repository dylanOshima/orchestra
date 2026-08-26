import { tool } from "@opencode-ai/plugin";
import path from "path";
import fs from "fs";

export default tool({
  description: "Display orchestra tasks DAG – JS fallback, prefers display-dag.py if available",
  args: {
    artifacts_dir: tool.schema.string().optional(),
    feature: tool.schema.string().optional(),
    file_path: tool.schema.string().optional(),
  },
  async execute(args, ctx) {
    const artifactsDir = args.artifacts_dir || "docs/mvp";
    const tasksFile = args.file_path || path.join(artifactsDir, "tasks.jsonl");
    const resolved = path.isAbsolute(tasksFile) ? tasksFile : path.join(ctx.directory, tasksFile);

    // Try python script first
    const candidates = [
      path.join(ctx.directory, "src/scripts/display-dag.py"),
      path.join(ctx.directory, "scripts/display-dag.py"),
      path.join(process.cwd(), "scripts/display-dag.py"),
    ];
    for (const script of candidates) {
      if (fs.existsSync(script)) {
        try {
          const proc = Bun.spawn(["python3", script, resolved], { stdout: "pipe", stderr: "pipe", cwd: ctx.directory });
          const out = await new Response(proc.stdout).text();
          const err = await new Response(proc.stderr).text();
          await proc.exited;
          if (out.trim()) return out + (err ? `\nSTDERR:${err}` : "");
        } catch {}
      }
    }

    if (!fs.existsSync(resolved)) return `tasks.jsonl not found at ${resolved}`;
    const raw = fs.readFileSync(resolved, "utf8").split("\n").filter((l) => l.trim());
    let tasks: any[] = [];
    for (const line of raw) {
      try {
        tasks.push(JSON.parse(line));
      } catch {}
    }
    if (args.feature) tasks = tasks.filter((t) => t.feature === args.feature);
    const icons: Record<string, string> = { open: "○", in_progress: "◉", closed: "✓", blocked: "✗" };
    return tasks.map((t) => `${icons[t.status] || "?"} [${t.id}] ${t.goal} (${t.status}) deps:${(t.dependencies || []).join(",") || "-"}`).join("\n");
  },
});
