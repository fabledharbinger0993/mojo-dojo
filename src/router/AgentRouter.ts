import { ReasoningAgent } from "../agents/interfaces";
import {
  AgentResult,
  AgentRole,
  AgentTask,
  ClassificationResult,
  EngagementStance,
  LegacyAgentResult,
  OrchestrationContext,
  OrchestrationRuntimeConfig,
  RouterResult,
  TaskTag,
  TaskType,
} from "../types";
import { AgentRegistry, AgentRegistryEntry } from "../agents/AgentRegistry";

export interface RouteExecutionOptions {
  sessionId?: string;
  engagementStance?: EngagementStance;
  taskIdFactory?: (agent: AgentRole, taskType: TaskType) => string;
  maxAgentTasks?: number;
}

interface AgentRouterOptions {
  runtimeConfig?: OrchestrationRuntimeConfig;
  registry?: AgentRegistry;
  agentsById?: Record<string, ReasoningAgent>;
  staticAgentsByTag?: Partial<Record<TaskTag, ReasoningAgent[]>>;
}

function getSimulatedFailureIds(context?: Record<string, unknown>): Set<string> {
  const raw = context?.simulateFailureAgentIds;
  if (!Array.isArray(raw)) {
    return new Set<string>();
  }

  return new Set(
    raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
  );
}

function mapTagToTaskType(tag: TaskTag): TaskType {
  if (tag === "research") {
    return "research";
  }
  if (tag === "reasoning") {
    return "reasoning";
  }
  if (tag === "code") {
    return "coding";
  }
  return "system";
}

function mapTagToRole(tag: TaskTag): AgentRole {
  if (tag === "research") {
    return "RESEARCH";
  }
  if (tag === "reasoning") {
    return "REASONING";
  }
  if (tag === "code") {
    return "CODE";
  }
  return "TOOL";
}

class ConcurrencyLimiter {
  private readonly inFlight = new Map<string, number>();

  canRun(agentId: string, maxConcurrency?: number): boolean {
    const current = this.inFlight.get(agentId) ?? 0;
    if (!maxConcurrency || maxConcurrency <= 0) {
      return true;
    }
    return current < maxConcurrency;
  }

  start(agentId: string): void {
    this.inFlight.set(agentId, (this.inFlight.get(agentId) ?? 0) + 1);
  }

  finish(agentId: string): void {
    const current = this.inFlight.get(agentId) ?? 0;
    if (current <= 1) {
      this.inFlight.delete(agentId);
      return;
    }
    this.inFlight.set(agentId, current - 1);
  }
}

/**
 * Registry-driven router with optional static-agent mode for deterministic mocks.
 */
export class AgentRouter {
  private readonly concurrency = new ConcurrencyLimiter();

  constructor(private readonly options: AgentRouterOptions) {}

  private selectAgentsForTag(tag: TaskTag): Array<{ entry: AgentRegistryEntry; agent: ReasoningAgent }> {
    if (this.options.staticAgentsByTag) {
      const staticAgents = this.options.staticAgentsByTag[tag] ?? [];
      return staticAgents.map((agent, index) => ({
        entry: {
          id: agent.id,
          provider: "mock",
          roles: agent.roles,
          adapterClass: agent.constructor.name,
          apiKeyEnv: "",
          priority: 100 - index,
          timeoutMs: 12000,
          maxConcurrency: 8,
          enabled: true,
        },
        agent,
      }));
    }

    const role = mapTagToRole(tag);
    const entries = this.options.registry?.findEnabledByRole(role) ?? [];

    const selected: Array<{ entry: AgentRegistryEntry; agent: ReasoningAgent }> = [];
    for (const entry of entries) {
      const agent = this.options.agentsById?.[entry.id];
      if (agent) {
        selected.push({ entry, agent });
      }
    }

    return selected;
  }

  async routeAndExecute(
    classification: ClassificationResult,
    userMessage: string,
    context?: Record<string, unknown>,
    options?: RouteExecutionOptions,
  ): Promise<RouterResult> {
    const byTag: RouterResult["byTag"] = {};
    const traceTasks: AgentTask[] = [];
    const traceResults: AgentResult[] = [];
    let taskBudget = options?.maxAgentTasks ?? Number.MAX_SAFE_INTEGER;
    const simulatedFailureIds = getSimulatedFailureIds(context);

    const tagJobs = classification.tags.map(async (tag) => {
      if (taskBudget <= 0) {
        byTag[tag] = [];
        return;
      }

      const taskType = mapTagToTaskType(tag);
      const role = mapTagToRole(tag);
      const agentBindings = this.selectAgentsForTag(tag);
      if (agentBindings.length === 0) {
        byTag[tag] = [];
        return;
      }

      const selectedBindings = agentBindings.slice(0, taskBudget);
      taskBudget -= selectedBindings.length;

      const tasksForAgents = selectedBindings.map(({ agent, entry }, index) => {
        const id =
          options?.taskIdFactory?.(role, taskType) ??
          `${options?.sessionId ?? "session"}:${taskType}:${role}:${index + 1}`;

        const traceTask: AgentTask = {
          id,
          sessionId: options?.sessionId ?? "session",
          agent: role,
          taskType,
          prompt: userMessage,
          metadata: {
            routedTag: tag,
            routedAgentId: agent.id,
            engagementStance: options?.engagementStance ?? "collaborative",
            provider: entry.provider,
          },
        };

        traceTasks.push(traceTask);
        return { agent, entry, traceTask };
      });

      const settled = await Promise.allSettled(
        tasksForAgents.map(async ({ agent, entry, traceTask }) => {
          if (simulatedFailureIds.has(agent.id)) {
            throw new Error(`simulated failure for ${agent.id}`);
          }

          if (!this.concurrency.canRun(agent.id, entry.maxConcurrency)) {
            return {
              skipped: true,
              result: {
                id: traceTask.id,
                agent: traceTask.agent,
                taskType: traceTask.taskType,
                content: `[fallback] ${agent.id} skipped due to maxConcurrency limit.`,
                error: "max-concurrency",
                metadata: {
                  agent: agent.id,
                  provider: entry.provider,
                  live: false,
                  skipped: true,
                },
              } satisfies AgentResult,
            };
          }

          this.concurrency.start(agent.id);
          try {
            const orchestrationContext: OrchestrationContext = {
              prompt: userMessage,
              timeoutMs: entry.timeoutMs,
              requestContext: context,
              previousAgentOutputs: traceResults,
            };

            const result = await agent.run(traceTask, orchestrationContext);
            return { skipped: false, result };
          } finally {
            this.concurrency.finish(agent.id);
          }
        }),
      );

      byTag[tag] = settled.map((settledResult, index) => {
        const traceTask = tasksForAgents[index]?.traceTask;
        const entry = tasksForAgents[index]?.entry;

        if (settledResult.status === "fulfilled") {
          const mapped: AgentResult = {
            id: traceTask?.id ?? settledResult.value.result.id,
            agent: traceTask?.agent ?? settledResult.value.result.agent,
            taskType: traceTask?.taskType ?? settledResult.value.result.taskType,
            content: settledResult.value.result.content,
            error: settledResult.value.result.error,
            latencyMs: settledResult.value.result.latencyMs,
            tokensUsed: settledResult.value.result.tokensUsed,
            metadata: settledResult.value.result.metadata,
          };

          traceResults.push(mapped);

          const legacy: LegacyAgentResult = {
            agentId: tasksForAgents[index]?.agent.id ?? `${tag}.unknown`,
            tag,
            content: mapped.content,
            metadata: {
              ...(mapped.metadata ?? {}),
              error: mapped.error,
            },
          };
          return legacy;
        }

        const errorMessage =
          settledResult.reason instanceof Error ? settledResult.reason.message : "unknown error";

        const errored: AgentResult = {
          id: traceTask?.id ?? `${tag}:${index + 1}`,
          agent: traceTask?.agent ?? role,
          taskType: traceTask?.taskType ?? taskType,
          content: `[error] ${errorMessage}`,
          error: errorMessage,
          metadata: {
            provider: entry?.provider ?? "unknown",
            live: false,
          },
        };

        traceResults.push(errored);
        return {
          agentId: tasksForAgents[index]?.agent.id ?? `${tag}.unknown`,
          tag,
          content: `[error] agent failed: ${errorMessage}`,
          metadata: {
            error: true,
            provider: entry?.provider ?? "unknown",
          },
        };
      });
    });

    await Promise.all(tagJobs);

    const taskOrder = new Map(traceTasks.map((task, index) => [task.id, index]));
    traceResults.sort((a, b) => {
      const aIndex = taskOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = taskOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });

    return {
      classification,
      byTag,
      trace: {
        sessionId: options?.sessionId,
        tasks: traceTasks,
        results: traceResults,
      },
    };
  }
}
