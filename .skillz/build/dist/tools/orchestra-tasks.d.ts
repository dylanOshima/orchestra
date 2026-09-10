/**
 * Orchestra tasks tool – standalone version for .opencode/tools discovery
 * Same logic as in src/index.ts, but as individual tool file for filesystem discovery.
 * Filename = tool name, so this registers as `orchestra-tasks` (dash) which OpenCode maps to underscore?
 * Prefer plugin.tool registration as `orchestra_tasks` – this file is for reference / local override.
 */
declare const _default: {
    description: string;
    args: {
        action: import("zod").ZodEnum<{
            read: "read";
            append: "append";
            "update-status": "update-status";
            list: "list";
            validate: "validate";
        }>;
        artifacts_dir: import("zod").ZodOptional<import("zod").ZodString>;
        feature: import("zod").ZodOptional<import("zod").ZodString>;
        task_json: import("zod").ZodOptional<import("zod").ZodString>;
        file_path: import("zod").ZodOptional<import("zod").ZodString>;
    };
    execute(args: {
        action: "read" | "append" | "update-status" | "list" | "validate";
        artifacts_dir?: string;
        feature?: string;
        task_json?: string;
        file_path?: string;
    }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
};
export default _default;
//# sourceMappingURL=orchestra-tasks.d.ts.map