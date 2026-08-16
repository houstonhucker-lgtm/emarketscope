// Renders EmailSections into HTML + plain text. Every item keeps its
// source link regardless of section, per spec. Sections (and categories
// within Category Highlights) with zero items are omitted entirely, never
// padded.

import type { Category } from "../lib/types.js";
import type { EmailSectionItem, EmailSections } from "./sections.js";

const CATEGORY_LABELS: Record<Category, string> = {
  household_essentials: "Household Essentials",
  health: "Health",
  beauty: "Beauty",
  personal_care: "Personal Care",
  baby_care: "Baby Care",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemHtml(item: EmailSectionItem): string {
  const source = item.source_name ? escapeHtml(item.source_name) : "Source";
  return `
    <li style="margin-bottom: 14px;">
      <div style="font-weight: 600;">${escapeHtml(item.title)}</div>
      <div style="margin: 4px 0;">${escapeHtml(item.body)}</div>
      <a href="${escapeHtml(item.source_url)}" style="font-size: 13px; color: #2563eb;">${source} &rarr;</a>
    </li>`;
}

function sectionHtml(heading: string, items: EmailSectionItem[]): string {
  if (items.length === 0) return "";
  return `
    <h2 style="font-size: 18px; margin: 28px 0 10px;">${escapeHtml(heading)}</h2>
    <ul style="list-style: none; padding: 0; margin: 0;">
      ${items.map(itemHtml).join("")}
    </ul>`;
}

export function renderEmailHtml(title: string, sections: EmailSections): string {
  const categoryBlocks = (Object.keys(CATEGORY_LABELS) as Category[])
    .map((category) => {
      const items = sections.categoryHighlights[category];
      if (!items || items.length === 0) return "";
      return sectionHtml(CATEGORY_LABELS[category], items);
    })
    .filter(Boolean)
    .join("");

  const categorySection =
    categoryBlocks.length > 0
      ? `<h1 style="font-size: 20px; margin: 32px 0 4px;">Category Highlights</h1>${categoryBlocks}`
      : "";

  const body = [
    sectionHtml("Key Dates", sections.keyDates),
    sectionHtml("UX & Feature Updates", sections.uxFeatureUpdates),
    sectionHtml("Signature Events", sections.signatureEvents),
    categorySection,
    sectionHtml("Additional Context", sections.additionalContext),
    sectionHtml("Investor & Earnings Signal", sections.investorEarningsSignal),
  ].join("");

  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 640px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 22px; margin-bottom: 4px;">${escapeHtml(title)}</h1>
    ${body || `<p style="color: #666;">Nothing found for this period.</p>`}
  </body>
</html>`;
}

function itemText(item: EmailSectionItem): string {
  return `- ${item.title}\n  ${item.body}\n  ${item.source_name ? `${item.source_name}: ` : ""}${item.source_url}`;
}

function sectionText(heading: string, items: EmailSectionItem[]): string {
  if (items.length === 0) return "";
  return `\n${heading}\n${"-".repeat(heading.length)}\n${items.map(itemText).join("\n\n")}\n`;
}

export function renderEmailText(title: string, sections: EmailSections): string {
  const categoryBlocks = (Object.keys(CATEGORY_LABELS) as Category[])
    .map((category) => {
      const items = sections.categoryHighlights[category];
      if (!items || items.length === 0) return "";
      return sectionText(CATEGORY_LABELS[category], items);
    })
    .filter(Boolean)
    .join("");

  const parts = [
    sectionText("Key Dates", sections.keyDates),
    sectionText("UX & Feature Updates", sections.uxFeatureUpdates),
    sectionText("Signature Events", sections.signatureEvents),
    categoryBlocks ? `\nCategory Highlights\n===================\n${categoryBlocks}` : "",
    sectionText("Additional Context", sections.additionalContext),
    sectionText("Investor & Earnings Signal", sections.investorEarningsSignal),
  ].join("");

  return `${title}\n${"=".repeat(title.length)}\n${parts || "\nNothing found for this period.\n"}`;
}
