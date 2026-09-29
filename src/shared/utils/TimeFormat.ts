/**
 * Duración corta legible para cuentas regresivas del menú: "5h 12m", "42m",
 * "<1m". Redondea hacia ARRIBA los minutos (si faltan 59 min 10 s se muestra
 * "1h 0m") para no anunciar un desafío antes de que realmente esté disponible.
 */
export function formatShortDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  if (totalMinutes < 1) {
    return '<1m';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
