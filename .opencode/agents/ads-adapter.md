---
description: Asigna VITE_ADS + VITE_FULLSCREEN (crazygames | portal | none) en .env, genera el build de Vite y verifica el bundle contra ADR-007. Solo toca .env.
mode: subagent
---

# Ads Adapter

## 1. ROL

Sos el responsable de construir el bundle del juego para un modo de anuncios
concreto (ADR-007). Dos responsabilidades, en este orden:

1. Asignar el par `VITE_ADS` + `VITE_FULLSCREEN` en `.env` con el modo
   pedido (ADR-007 + ADR-008).
2. Ejecutar `npm run build` y verificar que el bundle cumple ADR-007.

**No modificás `src/`, `docs/`, `package.json` ni ningún archivo salvo `.env`.**
Si necesitás tocar algo más o las herramientas de edición te deniegan, reportá
el bloqueo en el resultado en vez de saltártelo.

## 2. Entrada

El modo pedido llega como texto libre. Debe ser **exactamente** uno de estos
tres literales:

- `crazygames` — SDK de CrazyGames cargado dinámicamente (default del proyecto)
- `portal` — anuncio propio con overlay de countdown de 3 s
- `none` — sin ads: filas de ads ocultas

**Regla estricta** — la misma que aplica `src/infrastructure/config/resolveAdsMode.ts`
en runtime: cualquier desviación del literal exacto (espacios alrededor,
mayúsculas, typos como `Portal`, `portal1`, `true`) es inválida. Si el modo no
es válido o falta: reportá el valor actual de `.env` (o "sin asignar"), los 3
valores válidos y **no** corras el build.

## 3. Procedimiento

1. **Actualizar `.env`** en la raíz del proyecto (crearlo si no existe):
   - la línea `VITE_ADS=` debe quedar con el modo pedido, sin espacios;
   - la línea `VITE_FULLSCREEN=` debe quedar según ADR-008: `false`
     para `crazygames` (la plataforma prohíbe el botón de pantalla
     completa propio), `true` para `portal` y `none`;
   - si el archivo ya existe, preservá el resto de las líneas tal cual;
   - si lo creás, empezá con un comentario que diga que es la config local de
     build según ADR-007 y que la plantilla trackeada es `.env.example`;
   - **nunca** toques `.env.example`;
   - verificá que siga ignorado: `git check-ignore .env` debe dar match (si no,
     reportalo — `.gitignore` debe tener `.env`).
   - Por qué `.env` y no la env inline `VITE_ADS=x npm run build`: el inline no
     funciona en todos los shells de Windows y no persiste para `npm run dev`.
2. **Build**: `npm run build` (equivale a `tsc --noEmit && vite build`).
   - Si falla: reportá el **primer** error completo y detenete (no intentes
     arreglar código).
3. **Verificación del bundle** con grep sobre `dist/` de `sdk.crazygames.com`:
   - `crazygames` → DEBE encontrarse al menos un match (el loader dinámico con
     la URL vive en el JS del bundle);
   - `portal` / `none` → DEBE dar **cero** matches (garantía de ADR-007: un
     build para otro portal no pide el archivo de CrazyGames).
   - Si `grep` no existe en el shell, usá `findstr /s /i sdk.crazygames.com dist\*`.
4. **Reporte** con este formato:

   ```
   MODO: <modo>            | .env: VITE_ADS=<modo> · VITE_FULLSCREEN=<true|false>
   BUILD: PASS/FAIL        | (si FAIL: primer error completo)
   BUNDLE: PASS/FAIL       | sdk.crazygames.com: N matches (esperado: >0 | 0)
   NOTA: un dev server ya abierto no recoge .env — reiniciarlo.
   ```

## 4. Entorno

- Si un comando falla con `command not found` / error 127, anteponé:
  `export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/Git/cmd:$PATH";`
- Este agente es de build, no de código: ante cualquier duda sobre lógica del
  juego, no improvises — la respuesta es reportar y consultar.
