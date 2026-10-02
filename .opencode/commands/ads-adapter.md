---
description: Asigna VITE_ADS (crazygames | portal | none), genera npm run build y verifica el bundle (ADR-007)
agent: ads-adapter
subagent: true
---

Ejecutá el flujo completo del agente `ads-adapter` con este modo de ads:
$ARGUMENTS

Modos válidos (literales exactos): `crazygames` | `portal` | `none`.
Escribí el modo en `.env` (`VITE_ADS=`), corré `npm run build` y verificá el
bundle con grep de `sdk.crazygames.com` en `dist/` (>0 matches para
`crazygames`, 0 para `portal`/`none`). Devolvé el reporte MODO/BUILD/BUNDLE
con `VEREDICTO: PASS/FAIL`.
