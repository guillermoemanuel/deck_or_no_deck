# ADR-005: El bono periódico ya no puede dar 0

**Estado:** Aceptada · **Registrada:** 2026-09-30 (cambio original: commit `39258a7` / `DOND_BETA.1.3.1`)

## Contexto
`PERIODIC_BONUS_VALUES` era `[0, 1000, 2000, 3000, 4000, 5000]` — una de las 6 cartas
podía no premiar. En `DOND_BETA.1.3.1` pasó a `[500, 1000, 2000, 3000, 4000, 5000]`
(el cambio fue de producto) **pero el spec quedó esperando el rango viejo** y dejó la
suite en rojo hasta `fa036a3`.

## Decisión
Ninguna carta del bono queda vacía: el rango mínimo es **500**. El spec se actualizó al
rango acordado; el código conserva las ramas defensivas de "sin premio"
(`PERIODIC_BONUS_NO_PRIZE` en i18n, `claimPeriodicBonus` ignorando `value <= 0`) por si
el rango vuelve a incluir un 0 en el futuro.

## Consecuencias
- La rama "sin premio" en `PeriodicBonusModal` está hoy **inalcanzable** con el rango
  actual — es defensa, no bug.
- Si se decide volver a incluir el 0, solo hay que cambiar la constante: los specs ya
  cubren ambos lados (`toHaveLength(6)` + el rango explícito).
