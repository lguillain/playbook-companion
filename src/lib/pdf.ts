import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extract raw text from a PDF file, preserving line breaks via Y-position.
 * No heading detection — that's done by the LLM in the import function.
 */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;

  const items: { str: string; fontSize: number; y: number; page: number }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !(item as TextItem).str) continue;
      const ti = item as TextItem;
      items.push({
        str: ti.str,
        fontSize: Math.abs(ti.transform[3]),
        y: ti.transform[5],
        page: i,
      });
    }
  }

  if (items.length === 0) return "";

  // Build lines by detecting Y-position changes and page breaks
  const lines: string[] = [];
  let currentLine = "";
  let prevY = items[0].y;
  let prevPage = items[0].page;

  for (const item of items) {
    const yDelta = Math.abs(item.y - prevY);
    const isNewLine = item.page !== prevPage || yDelta > item.fontSize * 0.5;

    if (isNewLine && currentLine) {
      lines.push(currentLine.trim());
      currentLine = "";
    }

    currentLine += item.str;
    prevY = item.y;
    prevPage = item.page;
  }
  if (currentLine) {
    lines.push(currentLine.trim());
  }

  return lines.filter(Boolean).join("\n");
}
