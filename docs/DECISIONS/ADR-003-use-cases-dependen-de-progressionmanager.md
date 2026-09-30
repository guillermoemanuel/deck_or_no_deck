# ADR-003: Los use-cases usan el puerto `IProgressionService`; `GameServices` tipa la clase concreta

**Estado:** Aceptada · **Registrada:** 2026-09-30

## Contexto
Hay dos niveles distintos y conviene no confundirlos:

1. **Nivel use-case (`application/`)** — correcto: los constructores reciben
   `IProgressionService` (puerto definido en `domain/ports/`). DIP respetado.
   `OpenCardUseCase` y `ReviveWithAdUseCase` lo reciben **opcional** (`?`), los demás son
   obligatorios — misma responsabilidad de pagar premios, distinta estrictitud.
2. **Nivel presentación (`presentation/GameServices.ts:16`)** — excepción conocida:
   el campo `progressionManager` está tipado con la **clase concreta**
   `ProgressionManager` (importada desde `infrastructure/`). Es la **única** importación
   de `infrastructure` en toda `presentation/`.

## Decisión
Mantener ambos. La excepción (2) es estrecha, está documentada y está en un único archivo
que actúa de service locator. El `README` ya la listaba como decisión pragmática.

## Consecuencias
- El resto de `presentation/` no importa infraestructura: todas las escenas leen el bag
  vía `getServices(scene)`.
- **Mejora pendiente barata:** cambiar el tipo del campo a `IProgressionService` y mover
  el import a un tipo — eliminaría la flecha `presentation → infrastructure` por completo.
  *No hacerlo a ciegas*: verificar antes qué métodos concretos usan las escenas que no
  estén en el puerto (si el compilador queda limpio, era solo historicismo).
- **Inconsistencia relacionada:** `OpenCardUseCase`/`ReviveWithAdUseCase` aceptan el puerto
  como opcional mientras el resto lo exige. Unificar es decisión futura.
