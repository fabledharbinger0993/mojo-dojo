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
  const considerations = model.considerations
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");

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
    </style>
  </head>
  <body>
    <h1>${escapeHtml(model.title)}</h1>
    <p class="subtitle">${escapeHtml(model.subtitle)}</p>

    <section class="card">
      <strong>What to weigh first</strong>
      <ul>
        ${considerations}
      </ul>
      <div class="chips">${escapeHtml(model.styleSourceLabel)}</div>
      ${
        model.styleHints
          ? `<div class="chips">Style hints: ${escapeHtml(model.styleHints)}</div>`
          : ""
      }
    </section>

    <section class="card">
      <strong>Why this ranking</strong>
      <p>${escapeHtml(model.winnerReason)}</p>
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
  </body>
</html>`;
}
