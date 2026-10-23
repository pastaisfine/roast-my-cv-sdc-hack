export type Result = { text: string; warnings: string[]; model: "english_g2"; device: "cpu" };

export class OcrError extends Error {
  constructor(public status: number, message: string) { super(message); }
}