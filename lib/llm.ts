import "server-only";

// =============================================================
// Cliente Gemini (Google AI Studio API)
// =============================================================
// Pega REST directo a generativelanguage.googleapis.com.
// No requiere ningún SDK — sólo fetch.
//
// Vars de entorno:
//   GEMINI_API_KEY    — obligatoria. Crear en https://aistudio.google.com/apikey
//   GEMINI_MODEL      — opcional. Default: gemini-2.5-flash
//                       (gran balance velocidad/calidad/costo y ventana 1M tokens)
//                       Otras opciones: gemini-2.5-pro (más razonamiento),
//                       gemini-2.0-flash (más barato, menos contexto).
//
// El cliente falla silencioso si falta GEMINI_API_KEY (devuelve null),
// para que el digest pueda usar rule-based como fallback.

const DEFAULT_MODEL = "gemini-2.5-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiClient {
  /** Modelo en uso. */
  readonly model: string;
  /** Generación libre (texto). */
  generate(args: GenerateArgs): Promise<string>;
  /** Generación con respuesta JSON validada por el schema. */
  generateJson<T = unknown>(args: GenerateJsonArgs): Promise<T>;
}

export interface GenerateArgs {
  /** System prompt (instrucciones de rol). */
  system?: string;
  /** Mensaje del usuario. */
  user: string;
  /** Temperature 0..2. Default 0.4 (estable, no creativo en exceso). */
  temperature?: number;
  /** Max tokens en la respuesta. */
  maxOutputTokens?: number;
}

export interface GenerateJsonArgs extends GenerateArgs {
  /**
   * Schema en formato Google ResponseSchema (subset de JSON Schema).
   * Ver https://ai.google.dev/api/generate-content#Schema
   */
  schema: ResponseSchema;
}

export type ResponseSchema =
  | { type: "STRING"; description?: string; nullable?: boolean }
  | { type: "NUMBER"; description?: string; nullable?: boolean }
  | { type: "INTEGER"; description?: string; nullable?: boolean }
  | { type: "BOOLEAN"; description?: string; nullable?: boolean }
  | {
      type: "ARRAY";
      description?: string;
      items: ResponseSchema;
      nullable?: boolean;
    }
  | {
      type: "OBJECT";
      description?: string;
      properties: Record<string, ResponseSchema>;
      required?: string[];
      nullable?: boolean;
    };

// -------------------------------------------------------------
// Factory
// -------------------------------------------------------------

/**
 * Devuelve un cliente Gemini si hay API key configurada; null en otro caso.
 * Esto permite a los callers usar `if (llm) { ... }` y degradar a rule-based.
 */
export function getGeminiFromEnv(): GeminiClient | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  return createGemini({ apiKey, model });
}

export function createGemini(opts: {
  apiKey: string;
  model?: string;
}): GeminiClient {
  const model = opts.model ?? DEFAULT_MODEL;

  async function call(body: Record<string, unknown>): Promise<any> {
    const url = `${BASE_URL}/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(
        `Gemini ${model} falló: ${r.status} ${txt.slice(0, 400)}`,
      );
    }
    return r.json();
  }

  function buildContents(args: GenerateArgs) {
    return [
      {
        role: "user",
        parts: [{ text: args.user }],
      },
    ];
  }

  function buildConfig(args: GenerateArgs, extra: Record<string, unknown> = {}) {
    return {
      ...(args.system
        ? { systemInstruction: { parts: [{ text: args.system }] } }
        : {}),
      generationConfig: {
        temperature: args.temperature ?? 0.4,
        ...(args.maxOutputTokens
          ? { maxOutputTokens: args.maxOutputTokens }
          : {}),
        ...extra,
      },
    };
  }

  return {
    model,
    async generate(args) {
      const data = await call({
        contents: buildContents(args),
        ...buildConfig(args),
      });
      return extractText(data);
    },
    async generateJson(args) {
      const data = await call({
        contents: buildContents(args),
        ...buildConfig(args, {
          responseMimeType: "application/json",
          responseSchema: args.schema,
        }),
      });
      const raw = extractText(data);
      try {
        return JSON.parse(raw);
      } catch (e) {
        throw new Error(
          `Gemini devolvió JSON inválido: ${raw.slice(0, 300)}`,
        );
      }
    },
  };
}

function extractText(data: any): string {
  // Estructura típica:
  // { candidates: [{ content: { parts: [{ text: "..." }] } }], ... }
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((p: any) => p?.text ?? "").join("");
  if (!text) {
    const finishReason = candidate?.finishReason;
    throw new Error(
      `Gemini respondió vacío${finishReason ? ` (finishReason=${finishReason})` : ""}`,
    );
  }
  return text;
}
