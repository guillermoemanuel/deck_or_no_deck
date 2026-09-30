# ADR-002: No existe `Money`: la moneda es un `number` crudo

**Estado:** Aceptada · **Registrada:** 2026-09-30

## Contexto
`AGENTS.md` y el `README.md` describen un value object `Money`. En el código **no existe**:
toda la moneda (`coins` de progresión, costos del catálogo, premios, penalizaciones,
ofertas del banquero, récords) es un `number` de TypeScript.

## Decisión
Mantener `number` como tipo de moneda. La documentación que lo menciona como entidad
se corrige (Fase 2) en vez de crear el VO por cumplir con el doc.

## Consecuencias
- Riesgo real: no hay validación de NaN/negativos por tipo. Mitigado en los límites:
  `jsonStorage.toCount()` sanitiza lo persistido, `EnergyLevel`/ofertas clampean, y
  `ProgressionManager.applyLossPenalty()` **permite saldo negativo a propósito** (−5000).
- Si algún día hay backend con cuentas, introducir `Money` será un refactor mecánico
  beneficiado por el `strict` de TS.
- **No crear `Money` "porque el doc lo dice" sin revisar este ADR.**
