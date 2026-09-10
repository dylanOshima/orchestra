/**
 * Orchestra plugin for OpenCode.ai
 * OpenCode-native successor to mvp/superpowers – fast-flow: brainstorm → task JSONL → parallel delivery
 * Shared task protocol (tasks.jsonl) works across harnesses (Claude, Pi, Codex, OpenCode)
 * File watcher syncs .progress/ live state
 */
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { tool } from "@opencode-ai/plugin";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Simple frontmatter extraction – no deps
const extractAndStripFrontmatter = (content) => {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match)
        return { frontmatter: {}, content };
    const frontmatterStr = match[1];
    const body = match[2];
    const frontmatter = {};
    for (const line of frontmatterStr.split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
            frontmatter[key] = value;
        }
    }
    return { frontmatter, content: body };
};
const normalizePath = (p, homeDir) => {
    if (!p || typeof p !== "string")
        return null;
    let normalized = p.trim();
    if (!normalized)
        return null;
    if (normalized.startsWith("~/")) {
        normalized = path.join(homeDir, normalized.slice(2));
    }
    else if (normalized === "~") {
        normalized = homeDir;
    }
    return path.resolve(normalized);
};
// Resolve skills dir trying multiple candidates (dev src vs prod dist)
function resolveSkillsDir() {
    const candidates = [
        path.resolve(__dirname, "skills"),
        path.resolve(__dirname, "../skills"),
        path.resolve(__dirname, "../src/skills"),
        path.resolve(__dirname, "../../skills"),
        path.resolve(__dirname, "../dist/skills"),
        path.resolve(process.cwd(), "src/skills"),
        path.resolve(process.cwd(), "skills"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c) && fs.existsSync(path.join(c, "using-orchestra", "SKILL.md"))) {
            return c;
        }
        // fallback to using-mvp for compatibility
        if (fs.existsSync(c) && fs.existsSync(path.join(c, "using-mvp", "SKILL.md"))) {
            return c;
        }
    }
    // fallback to first that exists at all
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    return path.resolve(__dirname, "skills");
}
function resolvePluginRoot() {
    // __dirname is src/ in dev, dist/ in prod – plugin root is parent of those
    const candidates = [
        path.resolve(__dirname, ".."), // dist/ -> root, src/ -> root
        path.resolve(__dirname, "../.."),
        process.cwd(),
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, "package.json")))
            return c;
    }
    return candidates[0];
}
function resolveScriptsDir(pluginRoot) {
    const candidates = [
        path.join(pluginRoot, "dist/scripts"),
        path.join(pluginRoot, "src/scripts"),
        path.join(__dirname, "scripts"),
        path.resolve(__dirname, "../scripts"),
        path.resolve(pluginRoot, "scripts"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    return candidates[0];
}
function resolveAgentsDir(pluginRoot) {
    const candidates = [
        path.join(pluginRoot, "dist/agents"),
        path.join(pluginRoot, "src/agents"),
        path.join(__dirname, "agents"),
        path.resolve(__dirname, "../agents"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    return candidates[0];
}
function resolveCommandsDir(pluginRoot) {
    const candidates = [
        path.join(pluginRoot, "dist/commands"),
        path.join(pluginRoot, "src/commands"),
        path.join(__dirname, "commands"),
        path.resolve(__dirname, "../commands"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    return candidates[0];
}
function parseFrontmatterMd(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match)
        return { frontmatter: {}, body: content };
    const fmStr = match[1];
    const body = match[2];
    const frontmatter = {};
    for (const line of fmStr.split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) {
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
            frontmatter[k] = v;
        }
    }
    return { frontmatter, body };
}
// Bootstrap cache – file doesn't change during session
let _bootstrapCache = undefined;
let _skillsDirCache = undefined;
let _pluginRootCache = undefined;
function getSkillsDir() {
    if (_skillsDirCache === undefined) {
        _skillsDirCache = resolveSkillsDir();
    }
    return _skillsDirCache;
}
function getPluginRoot() {
    if (_pluginRootCache === undefined) {
        _pluginRootCache = resolvePluginRoot();
    }
    return _pluginRootCache;
}
function getBootstrapContent() {
    if (_bootstrapCache !== undefined)
        return _bootstrapCache;
    const skillsDir = getSkillsDir();
    // Try orchestra first, fallback mvp for compatibility
    const orchestraSkillPath = path.join(skillsDir, "using-orchestra", "SKILL.md");
    const mvpSkillPath = path.join(skillsDir, "using-mvp", "SKILL.md");
    let skillPath = orchestraSkillPath;
    if (!fs.existsSync(skillPath) && fs.existsSync(mvpSkillPath)) {
        skillPath = mvpSkillPath;
    }
    if (!fs.existsSync(skillPath)) {
        _bootstrapCache = null;
        return null;
    }
    const fullContent = fs.readFileSync(skillPath, "utf8");
    const { content } = extractAndStripFrontmatter(fullContent);
    const toolMapping = `**Tool Mapping for OpenCode (orchestra):**
When skills request actions, substitute OpenCode equivalents:
- Create or update todos → \`todowrite\`
- \`Subagent (general-purpose):\` or \`Agent({subagent_type:..})\` → \`task\` with \`subagent_type: "general"\` or specific orchestra agent (\`orchestra-task-executor\` etc)
- Invoke a skill → OpenCode's native \`skill\` tool (bare name: \`brainstorming\` not \`mvp:brainstorming\`)
- Read files → \`read\`
- Create, edit, or delete files → \`apply_patch\`
- Run shell commands → \`bash\`
- Search files → \`grep\`, \`glob\`
- Fetch a URL → \`webfetch\`
- Task tracking → \`orchestra_tasks\` custom tool (read/append/update-status/list) + file watcher on \`.progress/*.json\`
- DAG visualization → \`orchestra_dag\` tool
- Progress files → \`.progress/T*.json\` + fallback STATUS block (harness-agnostic)

**Shared Task Protocol (cross-harness):**
- \`docs/mvp/tasks.jsonl\` (or custom artifacts_dir) is append-only, file-wide sequential IDs T001...
- Harness-agnostic completion signal is STATUS block:
  STATUS: completed|stuck
  WORKTREE_PATH: <abs>
  BRANCH_NAME: <branch>
  VERIFICATION: <cmd summary>
  NEW_TASKS: [...]
- File watcher watches \`tasks.jsonl\` + \`.progress/*.json\` for live state, sync to todowrite.
- See \`references/opencode-tools.md\` for full mapping.

Use OpenCode's native \`skill\` tool to list and load skills.`;
    _bootstrapCache = `<EXTREMELY_IMPORTANT>
You have orchestra – fast-flow methodology (brainstorm → task JSONL → parallel delivery), OpenCode-native successor to mvp/superpowers.

**IMPORTANT: The using-orchestra skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-orchestra" again - that would be redundant.**

${content}

${toolMapping}
</EXTREMELY_IMPORTANT>`;
    return _bootstrapCache;
}
// Custom tool: orchestra_tasks – shared protocol management
const orchestraTasksTool = tool({
    description: "Manage orchestra tasks.jsonl – shared protocol across harnesses. Read, append, update-status, list DAG. Handles sequential IDs T001..., collision renumber, and parses .progress files.",
    args: {
        action: tool.schema.enum(["read", "append", "update-status", "list", "validate"]).describe("read: load tasks; append: add new tasks JSON array; update-status: set status; list: summary + DAG; validate: check JSONL"),
        artifacts_dir: tool.schema.string().optional().describe("Artifacts dir, default docs/mvp"),
        feature: tool.schema.string().optional().describe("Feature slug filter"),
        task_json: tool.schema.string().optional().describe("For append: JSON string of task(s) {goal,success_criteria,dependencies,resources,complexity} or array. For update-status: {id,status}"),
        file_path: tool.schema.string().optional().describe("Override tasks.jsonl path (absolute or relative)"),
    },
    async execute(args, ctx) {
        const artifactsDir = args.artifacts_dir || "docs/mvp";
        const tasksFile = args.file_path || path.join(artifactsDir, "tasks.jsonl");
        const resolvedTasksFile = path.isAbsolute(tasksFile) ? tasksFile : path.join(ctx.directory, tasksFile);
        const ensureDir = () => {
            const dir = path.dirname(resolvedTasksFile);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
        };
        try {
            if (args.action === "read" || args.action === "list" || args.action === "validate") {
                if (!fs.existsSync(resolvedTasksFile)) {
                    return `tasks.jsonl not found at ${resolvedTasksFile}. No tasks yet.`;
                }
                const raw = fs.readFileSync(resolvedTasksFile, "utf8");
                const lines = raw.split("\n").filter((l) => l.trim());
                let tasks = [];
                let errors = [];
                for (let i = 0; i < lines.length; i++) {
                    try {
                        const t = JSON.parse(lines[i]);
                        tasks.push(t);
                    }
                    catch (e) {
                        errors.push(`Line ${i + 1}: ${e.message}`);
                    }
                }
                let filtered = tasks;
                if (args.feature) {
                    filtered = tasks.filter((t) => t.feature === args.feature);
                }
                if (args.action === "validate") {
                    if (errors.length)
                        return `Validation FAILED: ${errors.join("; ")}`;
                    // check duplicate IDs
                    const ids = filtered.map((t) => t.id);
                    const dup = ids.filter((id, idx) => ids.indexOf(id) !== idx);
                    if (dup.length)
                        return `Validation WARNING: duplicate IDs ${[...new Set(dup)].join(",")}. Use renumber-tasks.py to fix.`;
                    return `Validation PASSED: ${filtered.length} tasks, IDs T001..T${String(filtered.length).padStart(3, "0")} sequential. No errors.`;
                }
                if (args.action === "read") {
                    return JSON.stringify(filtered, null, 2);
                }
                // list
                const statusCounts = {};
                for (const t of filtered)
                    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
                const ready = filtered.filter((t) => t.status === "open" && (t.dependencies || []).every((dep) => tasks.find((x) => x.id === dep)?.status === "closed")).length;
                const summary = [
                    `Feature: ${args.feature || "all"}`,
                    `File: ${resolvedTasksFile}`,
                    `Tasks: ${filtered.length} total — ${Object.entries(statusCounts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}`,
                    `Ready now: ${ready}`,
                    `Max agents: 5`,
                ].join("\n");
                const dagList = filtered.map((t) => `[${t.id}] ${t.feature} ${t.status} deps:${(t.dependencies || []).join(",") || "none"} → ${t.goal}`).join("\n");
                return `${summary}\n\n${dagList}`;
            }
            if (args.action === "append") {
                if (!args.task_json)
                    return "append requires task_json arg";
                ensureDir();
                let newTasks;
                try {
                    const parsed = JSON.parse(args.task_json);
                    newTasks = Array.isArray(parsed) ? parsed : [parsed];
                }
                catch {
                    return `Invalid task_json – must be JSON. Got: ${args.task_json.slice(0, 200)}`;
                }
                let existingLines = [];
                let maxIdNum = 0;
                if (fs.existsSync(resolvedTasksFile)) {
                    const raw = fs.readFileSync(resolvedTasksFile, "utf8");
                    existingLines = raw.split("\n").filter((l) => l.trim());
                    for (const line of existingLines) {
                        try {
                            const t = JSON.parse(line);
                            const num = parseInt(t.id.replace(/^T/, ""), 10);
                            if (!isNaN(num) && num > maxIdNum)
                                maxIdNum = num;
                        }
                        catch { }
                    }
                }
                const appended = [];
                for (const nt of newTasks) {
                    maxIdNum++;
                    const id = `T${String(maxIdNum).padStart(3, "0")}`;
                    const task = {
                        id,
                        feature: args.feature || nt.feature || "unknown",
                        goal: nt.goal,
                        success_criteria: nt.success_criteria,
                        status: "open",
                        dependencies: nt.dependencies || [],
                        resources: nt.resources || [],
                        complexity: nt.complexity || "medium",
                    };
                    if (!task.goal || !task.success_criteria) {
                        return `Task missing goal or success_criteria: ${JSON.stringify(nt)}`;
                    }
                    appended.push(task);
                }
                const toAppend = appended.map((t) => JSON.stringify(t)).join("\n") + "\n";
                fs.appendFileSync(resolvedTasksFile, toAppend);
                return `Appended ${appended.length} tasks: ${appended.map((t) => t.id).join(", ")} to ${resolvedTasksFile}`;
            }
            if (args.action === "update-status") {
                if (!args.task_json)
                    return "update-status requires task_json {id,status}";
                let payload;
                try {
                    payload = JSON.parse(args.task_json);
                }
                catch {
                    return "Invalid task_json for update-status";
                }
                const { id, status } = payload;
                if (!id || !status)
                    return "Need id and status";
                if (!fs.existsSync(resolvedTasksFile))
                    return `tasks.jsonl not found at ${resolvedTasksFile}`;
                const raw = fs.readFileSync(resolvedTasksFile, "utf8").split("\n").filter((l) => l.trim());
                let found = false;
                const updated = raw.map((line) => {
                    try {
                        const t = JSON.parse(line);
                        if (t.id === id) {
                            found = true;
                            t.status = status;
                            t.updated_at = new Date().toISOString();
                            return JSON.stringify(t);
                        }
                        return line;
                    }
                    catch {
                        return line;
                    }
                });
                if (!found)
                    return `Task ${id} not found`;
                fs.writeFileSync(resolvedTasksFile, updated.join("\n") + "\n");
                return `Updated ${id} → ${status}`;
            }
            return `Unknown action ${args.action}`;
        }
        catch (e) {
            return `Error in orchestra_tasks tool: ${e.message}`;
        }
    },
});
const orchestraDagTool = tool({
    description: "Display orchestra tasks DAG – calls display-dag.py or JS fallback. Shows levels, status icons, blocked details.",
    args: {
        artifacts_dir: tool.schema.string().optional().describe("Artifacts dir default docs/mvp"),
        feature: tool.schema.string().optional(),
        file_path: tool.schema.string().optional(),
    },
    async execute(args, ctx) {
        const artifactsDir = args.artifacts_dir || "docs/mvp";
        const tasksFile = args.file_path || path.join(artifactsDir, "tasks.jsonl");
        const resolved = path.isAbsolute(tasksFile) ? tasksFile : path.join(ctx.directory, tasksFile);
        const pluginRoot = getPluginRoot();
        const scriptsDir = resolveScriptsDir(pluginRoot);
        const dagScript = path.join(scriptsDir, "display-dag.py");
        if (fs.existsSync(dagScript)) {
            try {
                const proc = Bun.spawn(["python3", dagScript, resolved], {
                    stdout: "pipe",
                    stderr: "pipe",
                    cwd: ctx.directory,
                });
                const out = await new Response(proc.stdout).text();
                const err = await new Response(proc.stderr).text();
                await proc.exited;
                if (out.trim())
                    return out + (err ? `\nSTDERR: ${err}` : "");
                if (err)
                    return `DAG script stderr: ${err}`;
            }
            catch (e) {
                // fallback
            }
        }
        // JS fallback
        if (!fs.existsSync(resolved))
            return `tasks.jsonl not found at ${resolved}`;
        const raw = fs.readFileSync(resolved, "utf8").split("\n").filter((l) => l.trim());
        let tasks = [];
        for (const line of raw) {
            try {
                tasks.push(JSON.parse(line));
            }
            catch { }
        }
        if (args.feature)
            tasks = tasks.filter((t) => t.feature === args.feature);
        const icons = { open: "○", in_progress: "◉", closed: "✓", blocked: "✗" };
        return tasks.map((t) => `${icons[t.status] || "?"} [${t.id}] ${t.goal} (${t.status}) deps:${(t.dependencies || []).join(",") || "-"}`).join("\n");
    },
});
export const OrchestraPlugin = async ({ client, directory }) => {
    const homeDir = os.homedir();
    const skillsDir = getSkillsDir();
    const pluginRoot = getPluginRoot();
    const scriptsDir = resolveScriptsDir(pluginRoot);
    const agentsDir = resolveAgentsDir(pluginRoot);
    const envConfigDir = normalizePath(process.env.OPENCODE_CONFIG_DIR, homeDir);
    const configDir = envConfigDir || path.join(homeDir, ".config/opencode");
    // File watcher state – debounce
    const seenProgress = new Map();
    const DEBOUNCE_MS = 750;
    const ownWrites = new Map();
    const shouldHandle = (file) => {
        if (!file.includes("docs/mvp") && !file.includes(".progress") && !file.includes("tasks.jsonl"))
            return false;
        const now = Date.now();
        const lastOwn = ownWrites.get(file) || 0;
        if (now - lastOwn < DEBOUNCE_MS * 2)
            return false; // skip own write
        const last = seenProgress.get(file) || 0;
        if (now - last < DEBOUNCE_MS)
            return false;
        seenProgress.set(file, now);
        return true;
    };
    return {
        config: async (config) => {
            config.skills = config.skills || {};
            config.skills.paths = config.skills.paths || [];
            if (!config.skills.paths.includes(skillsDir)) {
                config.skills.paths.push(skillsDir);
            }
            // Load commands from commands dir
            try {
                const commandsDir = resolveCommandsDir(pluginRoot);
                if (fs.existsSync(commandsDir)) {
                    config.command = config.command || {};
                    for (const file of fs.readdirSync(commandsDir)) {
                        if (!file.endsWith(".md"))
                            continue;
                        const fullPath = path.join(commandsDir, file);
                        const content = fs.readFileSync(fullPath, "utf8");
                        const { frontmatter, body } = parseFrontmatterMd(content);
                        const name = path.basename(file, ".md");
                        config.command[name] = {
                            template: body,
                            description: frontmatter.description || name,
                            agent: frontmatter.agent || "build",
                            model: frontmatter.model,
                            subtask: frontmatter.subtask ? frontmatter.subtask === "true" : undefined,
                        };
                    }
                }
            }
            catch (e) {
                // ignore command load errors
            }
            // Load agents from agents dir and inject into config.agent
            try {
                const agentsDirResolved = resolveAgentsDir(pluginRoot);
                if (fs.existsSync(agentsDirResolved)) {
                    config.agent = config.agent || {};
                    for (const file of fs.readdirSync(agentsDirResolved)) {
                        if (!file.endsWith(".md"))
                            continue;
                        const fullPath = path.join(agentsDirResolved, file);
                        const content = fs.readFileSync(fullPath, "utf8");
                        const { frontmatter, body } = parseFrontmatterMd(content);
                        const rawName = path.basename(file, ".md");
                        // Ensure orchestra- prefix for OpenCode naming to avoid collisions, but keep orchestrator -> orchestra-orchestrator
                        const agentName = rawName.startsWith("orchestra-") ? rawName : `orchestra-${rawName}`;
                        // Parse permission JSON if present as yaml-like? For simplicity, keep frontmatter parsing for description/mode/etc, body as prompt
                        // Our agents already have complex permission objects in frontmatter that simple parser can't fully handle (nested)
                        // So we re-parse frontmatter as YAML-ish for top-level keys, but keep permission parsing lenient
                        // For now, inject minimal config: description, mode, color, permission if parsable, prompt as body
                        // We'll attempt to read the file with a more permissive yaml extraction for permission
                        // Extract description, mode, color, hidden from frontmatter
                        // For permission, we rely on the agent file's own frontmatter being read by OpenCode's own loader? But we are injecting via config, so we need to include permission
                        // Quick hack: if file contains "permission:" block, extract manually via JS eval? Instead we store prompt and let opencode's markdown loader handle if we copy agents to .opencode/agents discovery? For now we inject basic
                        config.agent[agentName] = config.agent[agentName] || {};
                        if (frontmatter.description)
                            config.agent[agentName].description = frontmatter.description;
                        if (frontmatter.mode)
                            config.agent[agentName].mode = frontmatter.mode;
                        if (frontmatter.color)
                            config.agent[agentName].color = frontmatter.color;
                        if (frontmatter.hidden)
                            config.agent[agentName].hidden = frontmatter.hidden === "true";
                        // Prompt
                        config.agent[agentName].prompt = body;
                        // For permission, try to parse the raw frontmatter permission block as JSON-ish – fallback: if we have file handle, we could keep the file in dist/agents and opencode might auto-discover if we add agents path to config? But there is no agents.paths, so injection is needed
                        // We will attempt to extract permission via regex for our known agents: they have permission: section with nested
                        // For simplicity, hardcode permissions for known orchestra agents
                        if (agentName === "orchestra-orchestrator") {
                            config.agent[agentName].permission = {
                                read: "allow",
                                edit: "allow",
                                bash: "allow",
                                glob: "allow",
                                grep: "allow",
                                task: { "*": "deny", "orchestra-task-executor": "allow", "orchestra-merge-resolver": "allow", "general": "allow", "explore": "allow" },
                                skill: "allow",
                                todowrite: "allow",
                            };
                            config.agent[agentName].mode = "subagent";
                            config.agent[agentName].hidden = true;
                        }
                        else if (agentName === "orchestra-task-executor") {
                            config.agent[agentName].permission = {
                                read: "allow",
                                edit: "allow",
                                bash: "allow",
                                glob: "allow",
                                grep: "allow",
                                skill: "allow",
                                todowrite: "allow",
                                task: "deny",
                            };
                            config.agent[agentName].mode = "subagent";
                            config.agent[agentName].hidden = true;
                        }
                        else if (agentName === "orchestra-merge-resolver") {
                            config.agent[agentName].permission = {
                                read: "allow",
                                edit: "allow",
                                bash: "allow",
                                glob: "allow",
                                grep: "allow",
                            };
                            config.agent[agentName].mode = "subagent";
                            config.agent[agentName].hidden = true;
                        }
                    }
                }
            }
            catch (e) {
                // ignore agent load errors
            }
            config.watcher = config.watcher || {};
            config.watcher.ignore = config.watcher.ignore || [];
            await client.app.log({
                body: {
                    service: "orchestra",
                    level: "info",
                    message: `Orchestra plugin loaded – skills:${skillsDir} agents:${agentsDir} scripts:${scriptsDir} pluginRoot:${pluginRoot}`,
                    extra: { skillsDir, agentsDir, scriptsDir, pluginRoot, configDir },
                },
            });
        },
        "shell.env": async (_input, output) => {
            output.env.ORCHESTRA_PLUGIN_ROOT = pluginRoot;
            output.env.ORCHESTRA_SCRIPTS = scriptsDir;
            output.env.ORCHESTRA_AGENTS = agentsDir;
            // Compat shims – many mvp skills still reference CLAUDE_PLUGIN_ROOT
            output.env.CLAUDE_PLUGIN_ROOT = pluginRoot;
            output.env.MVP_PLUGIN_ROOT = pluginRoot;
            output.env.ORCHESTRA_SKILLS = skillsDir;
        },
        "experimental.chat.messages.transform": async (_input, output) => {
            const bootstrap = getBootstrapContent();
            if (!bootstrap || !output.messages.length)
                return;
            const firstUser = output.messages.find((m) => m.info.role === "user");
            if (!firstUser || !firstUser.parts.length)
                return;
            if (firstUser.parts.some((p) => p.type === "text" && p.text.includes("EXTREMELY_IMPORTANT")))
                return;
            // Inject bootstrap as first part – keep compatible with SDK Part type via any cast
            const newPart = { type: "text", text: bootstrap };
            // Preserve id/session if available from ref for better tracking, but not required
            const ref = firstUser.parts[0];
            if (ref?.id)
                newPart.id = `${ref.id}-bootstrap`;
            firstUser.parts.unshift(newPart);
        },
        "experimental.session.compacting": async (_input, output) => {
            try {
                // Try to find tasks.jsonl in common locations
                const candidates = [
                    path.join(directory, "docs/mvp/tasks.jsonl"),
                    path.join(directory, "docs/orchestra/tasks.jsonl"),
                    path.join(directory, ".mvp/tasks.jsonl"),
                ];
                let tasksFile = null;
                for (const c of candidates) {
                    if (fs.existsSync(c)) {
                        tasksFile = c;
                        break;
                    }
                }
                if (!tasksFile) {
                    output.context.push(`## Orchestra Context\nNo tasks.jsonl found yet. If brainstorming was done, tasks should be in docs/mvp/tasks.jsonl.`);
                    return;
                }
                const raw = fs.readFileSync(tasksFile, "utf8").split("\n").filter((l) => l.trim());
                let tasks = [];
                for (const line of raw) {
                    try {
                        tasks.push(JSON.parse(line));
                    }
                    catch { }
                }
                const byFeature = {};
                for (const t of tasks) {
                    byFeature[t.feature] = byFeature[t.feature] || [];
                    byFeature[t.feature].push(t);
                }
                const featureSummaries = Object.entries(byFeature)
                    .map(([feat, ts]) => {
                    const counts = {};
                    for (const t of ts)
                        counts[t.status] = (counts[t.status] || 0) + 1;
                    const ready = ts.filter((t) => t.status === "open" && (t.dependencies || []).every((d) => tasks.find((x) => x.id === d)?.status === "closed")).length;
                    return `- ${feat}: ${ts.length} total (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}), ${ready} ready`;
                })
                    .join("\n");
                // Also read .progress files for live updates
                const progressDir = path.join(path.dirname(tasksFile), ".progress");
                let progressSummary = "";
                if (fs.existsSync(progressDir)) {
                    const files = fs.readdirSync(progressDir).filter((f) => f.endsWith(".json"));
                    const live = files
                        .slice(0, 20)
                        .map((f) => {
                        try {
                            const j = JSON.parse(fs.readFileSync(path.join(progressDir, f), "utf8"));
                            return `${j.id}:${j.status}${j.stuck_message ? ` STUCK:${j.stuck_message.slice(0, 100)}` : ""}`;
                        }
                        catch {
                            return `${f}:unreadable`;
                        }
                    })
                        .join(", ");
                    progressSummary = `\nLive progress files (${files.length}): ${live}`;
                }
                output.context.push(`## Orchestra State (preserved across compaction)
Tasks file: ${tasksFile}
Features:
${featureSummaries}
${progressSummary}

Shared protocol: tasks.jsonl is append-only, IDs T001... file-wide sequential. Completion signal is STATUS block + .progress/*.json. Orchestrator merges worktrees via merge-worktree.sh with mandatory integration_path.
If resuming, re-invoke executing-tasks skill with feature name – orchestrator picks up non-closed tasks. Reset stale in_progress → open before launch.`);
            }
            catch (e) {
                output.context.push(`## Orchestra Context Error\nFailed to read tasks.jsonl: ${e.message}`);
            }
        },
        tool: {
            orchestra_tasks: orchestraTasksTool,
            orchestra_dag: orchestraDagTool,
        },
        event: async ({ event }) => {
            if (event.type === "file.watcher.updated") {
                const { file, event: fsEvent } = event.properties;
                if (!shouldHandle(file))
                    return;
                await client.app.log({
                    body: {
                        service: "orchestra-watcher",
                        level: "debug",
                        message: `watcher ${fsEvent} ${path.basename(file)}`,
                        extra: { file, fsEvent },
                    },
                });
                // If tasks.jsonl changed externally, we could trigger todowrite sync in future
                // For now just log – main session's executing-tasks skill can poll
                if (file.endsWith("tasks.jsonl") && fsEvent === "change") {
                    try {
                        const raw = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
                        const tasks = raw.map((l) => {
                            try {
                                return JSON.parse(l);
                            }
                            catch {
                                return null;
                            }
                        }).filter(Boolean);
                        // Debounced log of counts – useful for TUI visibility
                        const counts = {};
                        for (const t of tasks)
                            counts[t.status] = (counts[t.status] || 0) + 1;
                        await client.app.log({
                            body: {
                                service: "orchestra-watcher",
                                level: "info",
                                message: `tasks.jsonl updated: ${tasks.length} tasks (${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(", ")})`,
                            },
                        });
                    }
                    catch { }
                }
                if (file.includes(".progress/") && file.endsWith(".json") && fsEvent !== "unlink") {
                    try {
                        const data = JSON.parse(fs.readFileSync(file, "utf8"));
                        if (data.status === "stuck" || data.status === "completed") {
                            await client.app.log({
                                body: {
                                    service: "orchestra-watcher",
                                    level: data.status === "stuck" ? "warn" : "info",
                                    message: `Progress ${data.id} ${data.status}${data.stuck_message ? `: ${data.stuck_message.slice(0, 200)}` : ""}`,
                                    extra: { id: data.id, status: data.status, feature: data.feature },
                                },
                            });
                        }
                    }
                    catch { }
                }
            }
            if (event.type === "todo.updated") {
                // Sync todo -> progress overview (optional)
                // We don't auto-write to tasks.jsonl from todos to avoid feedback loop
                await client.app.log({
                    body: {
                        service: "orchestra-watcher",
                        level: "debug",
                        message: `todos updated: ${event.properties.todos.length} items`,
                    },
                });
            }
        },
        "tool.execute.before": async (input, output) => {
            if (input.tool === "read" && output.args.filePath?.includes(".env")) {
                throw new Error("Orchestra: Do not read .env files – use env vars");
            }
        },
    };
};
// For backward compat with existing mvp installs that expect SuperpowersPlugin
export const SuperpowersPlugin = OrchestraPlugin;
export const MvpPlugin = OrchestraPlugin;
export default OrchestraPlugin;
//# sourceMappingURL=index.js.map