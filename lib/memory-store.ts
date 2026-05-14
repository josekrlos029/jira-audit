import "server-only";
import { promises as fs } from "fs";
import path from "path";

// =============================================================
// Memory store — contexto histórico del equipo
// =============================================================
// Guarda:
//   1. Snapshots de cada digest (lo que vimos, qué se cerró, qué estaba en riesgo)
//   2. Memoria de largo plazo en markdown (observaciones que el LLM va acumulando)
//   3. Patrones por persona (cuántas veces ha caído en cada patrón)
//
// Backend default: filesystem (./data/).
//
// Vercel: el FS es efímero (sólo /tmp es escribible, y se borra entre crons).
// Para producción real, swap a Vercel Blob, Vercel KV, o cualquier almacenamiento
// persistente externo. Esta interfaz (MemoryStore) está pensada para que
// cualquier backend se enchufe en su lugar.
//
// Ubicación del directorio configurable con DIGEST_DATA_DIR (default ./data).

// -------------------------------------------------------------
// Tipos del modelo de datos
// -------------------------------------------------------------

export interface SprintSnapshot {
  /** ISO timestamp. */
  takenAt: string;
  time: "morning" | "afternoon";
  projectKey: string;
  kpis: {
    total: number;
    done: number;
    prog: number;
    todo: number;
    bugs: number;
    unassigned: number;
    stale: number;
    pct: number;
  };
  juniors: Array<{
    id: string;
    name: string;
    email: string;
    total: number;
    done: number;
    prog: number;
    todo: number;
    stuckCount: number; // ≥3d sin tocar
    wipCount: number;
    bugsOpen: number;
    /** Llaves de items abiertos (para que el LLM pueda rastrear repeticiones). */
    openKeys: string[];
  }>;
  /** Observaciones que el LLM extrajo en ESTE run. */
  observations?: string[];
}

export interface JuniorPatterns {
  /** Email o accountId. */
  id: string;
  name: string;
  /** Conteo de veces que cayó en cada patrón histórico. */
  patternCounts: Record<string, number>;
  /** Última vez que cada patrón fue visto (ISO). */
  patternLastSeen: Record<string, string>;
  /** Notas libres que el LLM añade (rotadas, máx 30). */
  notes: Array<{ at: string; text: string }>;
}

// -------------------------------------------------------------
// Interfaz pública
// -------------------------------------------------------------

export interface MemoryStore {
  /** Histórico crudo de snapshots, más reciente primero. Cap opcional. */
  listSnapshots(opts?: { limit?: number }): Promise<SprintSnapshot[]>;
  appendSnapshot(s: SprintSnapshot): Promise<void>;

  /** Memoria de largo plazo en markdown (acumulada por el LLM). */
  readLongTermMemory(): Promise<string>;
  /** Substituye completamente. El caller decide cuándo recortar. */
  writeLongTermMemory(text: string): Promise<void>;

  /** Patrones acumulados por persona. */
  getJuniorPatterns(id: string): Promise<JuniorPatterns | null>;
  upsertJuniorPatterns(p: JuniorPatterns): Promise<void>;
  listJuniorPatterns(): Promise<JuniorPatterns[]>;
}

// -------------------------------------------------------------
// Implementación filesystem
// -------------------------------------------------------------
// Layout dentro de DIGEST_DATA_DIR:
//   snapshots.jsonl        - 1 línea por snapshot (append-only)
//   long-term.md           - texto markdown libre (sobreescribible)
//   juniors/<safeId>.json  - patterns por persona

function dataDir(): string {
  if (process.env.DIGEST_DATA_DIR) return process.env.DIGEST_DATA_DIR;
  // En Vercel, solo /tmp es escribible (efímero entre invocaciones).
  if (process.env.VERCEL) return "/tmp/data";
  return path.join(process.cwd(), "data");
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function createFsMemoryStore(rootOverride?: string): MemoryStore {
  const root = rootOverride ?? dataDir();
  const snapshotsPath = path.join(root, "snapshots.jsonl");
  const longTermPath = path.join(root, "long-term.md");
  const juniorsDir = path.join(root, "juniors");

  return {
    async listSnapshots(opts) {
      try {
        const raw = await fs.readFile(snapshotsPath, "utf8");
        const lines = raw
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .reverse();
        const out: SprintSnapshot[] = [];
        for (const line of lines) {
          try {
            out.push(JSON.parse(line) as SprintSnapshot);
          } catch {
            // ignorar líneas corruptas
          }
          if (opts?.limit && out.length >= opts.limit) break;
        }
        return out;
      } catch (e: any) {
        if (e?.code === "ENOENT") return [];
        throw e;
      }
    },

    async appendSnapshot(s) {
      await ensureDir(root);
      await fs.appendFile(snapshotsPath, JSON.stringify(s) + "\n", "utf8");
    },

    async readLongTermMemory() {
      try {
        return await fs.readFile(longTermPath, "utf8");
      } catch (e: any) {
        if (e?.code === "ENOENT") return "";
        throw e;
      }
    },

    async writeLongTermMemory(text) {
      await ensureDir(root);
      await fs.writeFile(longTermPath, text, "utf8");
    },

    async getJuniorPatterns(id) {
      try {
        const raw = await fs.readFile(
          path.join(juniorsDir, `${safeId(id)}.json`),
          "utf8",
        );
        return JSON.parse(raw) as JuniorPatterns;
      } catch (e: any) {
        if (e?.code === "ENOENT") return null;
        throw e;
      }
    },

    async upsertJuniorPatterns(p) {
      await ensureDir(juniorsDir);
      // Recortar notas a las 30 más recientes
      const compact: JuniorPatterns = {
        ...p,
        notes: [...(p.notes ?? [])]
          .sort((a, b) => (a.at < b.at ? 1 : -1))
          .slice(0, 30),
      };
      await fs.writeFile(
        path.join(juniorsDir, `${safeId(p.id)}.json`),
        JSON.stringify(compact, null, 2),
        "utf8",
      );
    },

    async listJuniorPatterns() {
      try {
        const files = await fs.readdir(juniorsDir);
        const out: JuniorPatterns[] = [];
        for (const f of files) {
          if (!f.endsWith(".json")) continue;
          try {
            const raw = await fs.readFile(path.join(juniorsDir, f), "utf8");
            out.push(JSON.parse(raw) as JuniorPatterns);
          } catch {
            // ignore corrupt
          }
        }
        return out;
      } catch (e: any) {
        if (e?.code === "ENOENT") return [];
        throw e;
      }
    },
  };
}

// -------------------------------------------------------------
// Conveniencia
// -------------------------------------------------------------

let cached: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!cached) cached = createFsMemoryStore();
  return cached;
}

// Útil para tests — reinicia el cache (no borra los archivos en disco).
export function _resetMemoryStoreForTests() {
  cached = null;
}
