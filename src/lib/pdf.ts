/**
 * Read a file as base64-encoded string.
 * Used to send PDFs directly to the Claude API as document content blocks.
 */
export function readFileAsBase64(
  file: File
): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:<mediaType>;base64," prefix
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mediaType: file.type || "application/pdf" });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
