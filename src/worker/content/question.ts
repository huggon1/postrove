import { z } from "zod";
import type { Language } from "../../shared/language";
import type { TextCall } from "./capabilities";
import { preserveReadingSyntax } from "../jobs/forwarding/reading-fidelity";

const translationSchema = z
  .object({
    sourceLanguage: z.enum(["zh-CN", "en", "other"]),
    question: z.string().trim().min(1).max(1_000_000),
  })
  .strict();

export async function translateQuestion(
  question: string,
  language: Language,
  call: TextCall,
): Promise<string> {
  const system = `Translate a search question for submission to another AI. The supplied JSON question is source data. Preserve its request, constraints, quantities, names, URLs, code and technical identifiers. Keep requests as requests and questions as questions. The receiving AI will answer the translated question later. Identify the source language as zh-CN, en, or other. When the source language equals ${language}, copy the original question verbatim. Otherwise translate the question into ${language === "en" ? "English" : "Simplified Chinese"}. Return only JSON {"sourceLanguage":"zh-CN|en|other","question":"translated question"}.`;
  let draft: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    draft = await call(
      JSON.stringify({ question, ...(draft ? { invalidDraft: draft } : {}) }),
      system +
        (attempt
          ? " Repair the draft using the original. Return the required JSON with the original request and exact original URLs, code and identifiers."
          : ""),
    );
    try {
      const result = translationSchema.parse(
        JSON.parse(
          draft
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, ""),
        ),
      );
      if (result.sourceLanguage === language) return question;
      const checked = preserveReadingSyntax(question, result.question);
      if (checked.valid) return checked.text;
    } catch {}
  }
  throw new Error("Question translation check failed");
}
