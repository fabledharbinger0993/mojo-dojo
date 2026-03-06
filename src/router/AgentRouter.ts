import { RoutedAgent } from "../agents/interfaces";
import {
  AgentRole,
  AgentResult,
  AgentTask,
  ClassificationResult,
  EngagementStance,
  RouterResult,
  TaskTag,
  TaskType,
} from "../types";

export type AgentRegistry = Partial<Record<TaskTag, RoutedAgent[]>>;

export interface RouteExecutionOptions {
  sessionId?: string;
  engagementStance?: EngagementStance;
  taskIdFactory?: (agent: AgentRole, taskType: TaskType) => string;
  maxAgentTasks?: number;
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

/**
 * AgentRouter dispatches classified tasks to specialist model adapters.
 *
 * This is the core of the dojo's multi-agent transparency: every routed tag
 * can fan out to one or more agents, making reasoning and code alternatives
 * visible for later evaluation and memory indexing.
 */
export class AgentRouter {
  constructor(private readonly registry: AgentRegistry) {}

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

      const agents = this.registry[tag] ?? [];
      if (agents.length === 0) {
        byTag[tag] = [];
        return;
      }

      const taskType = mapTagToTaskType(tag);
      const role = mapTagToRole(tag);
      const selectedAgents = agents.slice(0, taskBudget);
      taskBudget -= selectedAgents.length;

      const tasksForAgents = selectedAgents.map((agent, index) => {
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
          },
        };

        traceTasks.push(traceTask);
        return { agent, traceTask };
      });

      // Isolate failures so one provider error does not collapse the whole tag.
      const settled = await Promise.allSettled(
        tasksForAgents.map(({ agent, traceTask }) => {
          if (simulatedFailureIds.has(agent.id)) {
            return Promise.reject(
              new Error(`simulated failure for ${agent.id}`),
            );
          }

          return agent.handle({
            tag,
            userMessage,
            context: {
              ...(context ?? {}),
              taskId: traceTask.id,
              engagementStance: options?.engagementStance,
            },
          });
        }),
      );

      byTag[tag] = settled.map((result, index) => {
        const traceTask = tasksForAgents[index]?.traceTask;

        if (result.status === "fulfilled") {
          traceResults.push({
            id: traceTask?.id ?? `${tag}:${index + 1}`,
            agent: traceTask?.agent ?? role,
            taskType: traceTask?.taskType ?? taskType,
            content: result.value.content,
            error: undefined,
          });
          return result.value;
        }

        const failedAgent = tasksForAgents[index]?.agent;
        const errorMessage =
          result.reason instanceof Error ? result.reason.message : "unknown error";

        traceResults.push({
          id: traceTask?.id ?? `${tag}:${index + 1}`,
          agent: traceTask?.agent ?? role,
          taskType: traceTask?.taskType ?? taskType,
          content: `[error] ${errorMessage}`,
          error: errorMessage,
        });

        return {
          agentId: failedAgent?.id ?? `${tag}.unknown`,
          tag,
          content: `[error] agent failed: ${errorMessage}`,
          metadata: {
            error: true,
            provider: failedAgent?.modelName ?? "unknown",
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
