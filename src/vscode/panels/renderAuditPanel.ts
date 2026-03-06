import * as vscode from "vscode";
import { AuditViewModel } from "../adapters/auditViewModel";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAuditPanel(
  panel: vscode.WebviewPanel,
  model: AuditViewModel,
): void {
  const maxDiffChars = 8000;
  const fullDiff = model.diff.unified ?? "";
  const isDiffTruncated = fullDiff.length > maxDiffChars;
  const truncatedDiff = isDiffTruncated ? `${fullDiff.slice(0, maxDiffChars)}\n...` : fullDiff;
  const serializedAuditCode = JSON.stringify(model.diff.audit).replaceAll("</", "<\\/");

  const considerations =
    model.considerations.length > 0
      ? model.considerations.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")
      : "<li>Considerations are currently suppressed for this mode.</li>";

  const baselineStrengths = model.baseline.strengths
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");

  const secondOpinionStrengths = model.secondOpinion.strengths
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");

  const criteriaRows = model.criteriaSummary
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.criterion)}</td>
        <td>${escapeHtml(item.preferredLabel)}</td>
        <td>${escapeHtml(item.rationale)}</td>
      </tr>`,
    )
    .join("\n");

  const traceTaskItems =
    model.trace.taskIds.length > 0
      ? model.trace.taskIds.map((taskId) => `<li><code>${escapeHtml(taskId)}</code></li>`).join("\n")
      : "<li>No routed task IDs available.</li>";

  const failedAgentItems =
    model.trace.failedAgents.length > 0
      ? model.trace.failedAgents.map((agentId) => `<li><code>${escapeHtml(agentId)}</code></li>`).join("\n")
      : "<li>No failed agents recorded.</li>";

  panel.webview.html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        padding: 16px;
        line-height: 1.45;
      }
      h1 {
        margin: 0 0 4px;
        font-size: 1.3rem;
      }
      .subtitle {
        margin: 0 0 16px;
        opacity: 0.85;
      }
      .card {
        border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 12px;
      }
      .chips {
        font-size: 0.9rem;
        opacity: 0.9;
        margin-top: 4px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 10px;
      }
      ul {
        margin: 8px 0 0 18px;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin-top: 8px;
      }
      th,
      td {
        border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }
      th {
        font-weight: 600;
      }
      .diff {
        white-space: pre-wrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85rem;
        border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
        border-radius: 8px;
        padding: 10px;
        overflow-x: auto;
        max-height: 360px;
      }
      .actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .action-card {
        border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
        border-radius: 10px;
        padding: 10px;
        text-align: center;
      }
      .pill {
        display: flex;
        justify-content: center;
        margin-bottom: 8px;
      }
      button {
        width: 100%;
        border: 1px solid color-mix(in oklab, currentColor 35%, transparent);
        background: transparent;
        color: inherit;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      }
      .subtext {
        margin-top: 6px;
        font-size: 0.85rem;
        opacity: 0.85;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(model.title)}</h1>
    <p class="subtitle">${escapeHtml(model.subtitle)}</p>

    <section class="card">
      <strong>Mode</strong>
      <div><code>${escapeHtml(model.mode.label)}</code></div>
      <div>${escapeHtml(model.mode.description)}</div>
      ${
        model.mode.hint
          ? `<div class="chips">${escapeHtml(model.mode.hint)}</div>`
          : ""
      }
    </section>

    ${
      model.trace.statusBanner
        ? `<section class="card"><strong>Run status</strong><p>${escapeHtml(model.trace.statusBanner)}</p>
            ${
              model.trace.statusDetailsLabel
                ? `<details><summary>${escapeHtml(model.trace.statusDetailsLabel)}</summary>
                     <div style="margin-top: 8px;">Failed agents (if any)</div>
                     <ul>${failedAgentItems}</ul>
                     <div class="chips">See Traceability below for routed task IDs and evaluation links.</div>
                   </details>`
                : ""
            }
          </section>`
        : ""
    }

    <section class="card">
      <strong>Winner reason</strong>
      <p>${escapeHtml(model.winnerReason)}</p>
    </section>

    ${
      model.diffAvailable
        ? `<section class="card">
            <strong>Merge diff preview</strong>
            <div class="chips">Unified diff format</div>
            <pre class="diff">${escapeHtml(truncatedDiff)}</pre>
            ${
              isDiffTruncated
                ? `<details><summary>Expand full diff</summary><pre class="diff">${escapeHtml(fullDiff)}</pre></details>`
                : ""
            }
          </section>`
        : ""
    }

    ${
      model.diffAvailable
        ? `<section class="card">
            <strong>Choose your path</strong>
            <div class="actions">
              <div class="action-card">
                <div class="pill">
                  <svg width="58" height="20" viewBox="0 0 58 20" aria-hidden="true" role="img">
                    <rect x="1" y="1" width="56" height="18" rx="9" fill="#e64b4b" stroke="#9f2f2f" />
                  </svg>
                </div>
                <button id="applyBtn" type="button">Apply</button>
                <div class="subtext">Accept audit result</div>
              </div>
              <div class="action-card">
                <div class="pill">
                  <svg width="58" height="20" viewBox="0 0 58 20" aria-hidden="true" role="img">
                    <rect x="1" y="1" width="56" height="18" rx="9" fill="#4b72e6" stroke="#2f4aa0" />
                  </svg>
                </div>
                <button id="rejectBtn" type="button">Reject</button>
                <div class="subtext">Keep your original</div>
              </div>
            </div>
          </section>`
        : ""
    }

    <section class="card">
      <strong>What to weigh first</strong>
      <ul>
        ${considerations}
      </ul>
      ${
        model.considerationsSuppressed && model.considerationsSuppressedReason
          ? `<div class="chips">${escapeHtml(model.considerationsSuppressedReason)}</div>`
          : ""
      }
      <div class="chips">${escapeHtml(model.styleSourceLabel)}</div>
      ${
        model.styleHints
          ? `<div class="chips">Style hints: ${escapeHtml(model.styleHints)}</div>`
          : ""
      }
    </section>

    <section class="card">
      <strong>Traceability</strong>
      <div><strong>Engagement stance</strong></div>
      <div>${escapeHtml(model.trace.engagementStance)}</div>
      <details ${model.trace.traceCollapsed ? "" : "open"}>
        <summary>${escapeHtml(model.trace.inspectLabel)}</summary>
        <div style="margin-top: 8px;">
          <div>Evaluation winner task ID: <code>${escapeHtml(model.trace.winnerTaskId ?? "unavailable")}</code></div>
          ${
            model.trace.rubricVersion
              ? `<div>Evaluation rubric: <code>${escapeHtml(model.trace.rubricVersion)}</code></div>`
              : ""
          }
          <div class="chips">Routed task IDs</div>
          <ul>
            ${traceTaskItems}
          </ul>
        </div>
      </details>
    </section>

    <section class="grid">
      <article class="card">
        <strong>${escapeHtml(model.baseline.label)}</strong>
        <div>Score: ${model.baseline.score}</div>
        <ul>
          ${baselineStrengths}
        </ul>
      </article>
      <article class="card">
        <strong>${escapeHtml(model.secondOpinion.label)}</strong>
        <div>Score: ${model.secondOpinion.score}</div>
        <ul>
          ${secondOpinionStrengths}
        </ul>
      </article>
    </section>

    <section class="card">
      <strong>Rubric breakdown</strong>
      <table>
        <thead>
          <tr>
            <th>Criterion</th>
            <th>Preferred bid</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          ${criteriaRows}
        </tbody>
      </table>
    </section>
    <script>
      const vscode = acquireVsCodeApi();
      const applyBtn = document.getElementById("applyBtn");
      const rejectBtn = document.getElementById("rejectBtn");

      if (applyBtn) {
        applyBtn.addEventListener("click", () => {
          vscode.postMessage({
            type: "apply",
            code: ${serializedAuditCode},
          });
        });
      }

      if (rejectBtn) {
        rejectBtn.addEventListener("click", () => {
          vscode.postMessage({ type: "reject" });
        });
      }
    </script>
  </body>
</html>`;
}
