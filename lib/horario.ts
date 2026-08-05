/**
 * Regras de horário da Mila.
 *
 * Mila fica SILENCIOSA nos horários humanos:
 *   Seg-Sex 09:00-18:00 · Sáb 09:00-13:00
 *
 * Mila ATENDE nos horários fora + domingos + feriados nacionais.
 * Timezone: America/Sao_Paulo (Brasília, UTC-3).
 */

const FERIADOS_BR = new Set([
  // 2026
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21",
  "2026-05-01", "2026-06-04", "2026-08-05", // feriado local JP — Mila cobre
  "2026-09-07", "2026-10-12", "2026-11-02",
  "2026-11-15", "2026-11-20", "2026-12-25",
  // 2027
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21",
  "2027-05-01", "2027-05-27", "2027-09-07", "2027-10-12", "2027-11-02",
  "2027-11-15", "2027-11-20", "2027-12-25",
]);

function agoraBrasilia(): { diaSemana: number; hora: number; minuto: number; dataISO: string } {
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(agora);

  const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
  const dataISO = `${get("year")}-${get("month")}-${get("day")}`;
  const hora = Number(get("hour"));
  const minuto = Number(get("minute"));

  // Dia da semana em português curto: dom, seg, ter, qua, qui, sex, sáb
  const wk = (get("weekday") || "").toLowerCase().slice(0, 3);
  const mapa: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sáb: 6, sab: 6 };
  const diaSemana = mapa[wk] ?? 0;

  return { diaSemana, hora, minuto, dataISO };
}

/**
 * Retorna true se AGORA é horário humano (Mila deve ficar CALADA).
 * Regras:
 *   - Feriado nacional → não é horário humano (Mila atende como se fosse domingo)
 *   - Domingo → não é horário humano
 *   - Segunda-Sexta 09:00-18:00 → horário humano
 *   - Sábado 09:00-13:00 → horário humano
 *   - Resto → não é horário humano
 */
export function eHorarioHumano(): boolean {
  const { diaSemana, hora, dataISO } = agoraBrasilia();
  if (FERIADOS_BR.has(dataISO)) return false;
  if (diaSemana === 0) return false;                    // domingo
  if (diaSemana >= 1 && diaSemana <= 5) return hora >= 9 && hora < 18;  // seg-sex
  if (diaSemana === 6) return hora >= 9 && hora < 13;   // sáb
  return false;
}

/** Descreve o horário atual pra logs/dashboard. */
export function descrevHorario(): string {
  const { diaSemana, hora, minuto, dataISO } = agoraBrasilia();
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const feriado = FERIADOS_BR.has(dataISO) ? " (FERIADO)" : "";
  const hm = `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
  const modo = eHorarioHumano() ? "🤫 SILÊNCIO (humano atende)" : "🤖 MILA ATIVA";
  return `${dias[diaSemana]}${feriado} ${hm} — ${modo}`;
}
