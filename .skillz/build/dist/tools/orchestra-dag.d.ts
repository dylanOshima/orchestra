declare const _default: {
    description: string;
    args: {
        artifacts_dir: import("zod").ZodOptional<import("zod").ZodString>;
        feature: import("zod").ZodOptional<import("zod").ZodString>;
        file_path: import("zod").ZodOptional<import("zod").ZodString>;
    };
    execute(args: {
        artifacts_dir?: string;
        feature?: string;
        file_path?: string;
    }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
};
export default _default;
//# sourceMappingURL=orchestra-dag.d.ts.map