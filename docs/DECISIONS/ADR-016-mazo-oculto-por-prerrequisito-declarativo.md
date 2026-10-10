# ADR-016: Mazo oculto por prerrequisito declarativo (carta "?" de la tienda)

**Estado:** Aceptada · **Registrada:** 2026-10-10 · **Unidad:** mazo chessmaster oculto +
tab Mazos a 3 columnas (3 commits: `2036949` del usuario · `0a94c72` flag + use-cases ·
`b782f56` UI)

## Contexto

El chessmaster entra como **11º mazo** con precio 30000, pero de producto debe quedar
**oculto hasta poseer los 10 mazos base** (descubrimiento, no compra a la vista). Tres
problemas del diseño previo:

- **La lista visible se decidía en la escena**: `ShopScene` (sin test) era quien filtraba
  qué fila dibujar — el mismo hueco que ya se cerró para mejoras con
  `ListAvailableUpgradesUseCase` (filtro de ads).
- **La compra de mazos no tenía use-case** (deuda de `PLAYBOOK.md` §1): la escena llamaba
  `progressionManager.purchaseDeck` directo, así que una regla nueva de rechazo habría de
  vivir en la escena, donde nada está testeado.
- **Fila y compra podían contradecirse**: si la visibilidad se calcula en un lado y el
  rechazo en otro, un día la fila aparece y la compra cobra (o al revés).

## Decisión

- **(a) El catálogo solo declara el DATO:** `IDeckConfig.requiresAllBaseDecks?: true` en
  `domain/value-objects/DeckSetups.ts` — hoy lo declara **solo chessmaster**. El dominio no
  decide visibilidad ni compra.
- **(b) La regla de visibilidad vive en aplicación:** `ListAvailableDecksUseCase.execute()`
  → `DeckShopEntry[] { deckId, revealed }` con las **11 entradas en el orden de
  `DECK_SETUP_IDS`**. `BASE_DECK_IDS` se **deriva del flag**
  (`DECK_SETUP_IDS.filter(id => !DECK_SETUPS[id].requiresAllBaseDecks)`) — nunca un "10"
  hardcodeado: si mañana entra un mazo base nuevo, el prerrequisito crece solo. Una entrada
  está oculta **solo si** declara el flag Y aún faltan base Y no se posee a sí misma — un
  mazo ya pagado nunca se oculta (edge de save: ocultar algo comprado sería peor que
  mostrarlo).
- **(c) La compra pasa por `PurchaseDeckUseCase`:** cascada **dueño → prerequisito →
  delegar**; `locked_prerequisite` se devuelve **antes** de invocar
  `IProgressionService.purchaseDeck` (mismo criterio que `PurchaseSessionUpgradeUseCase`,
  PLAYBOOK §2.7: si se rechaza, no se descuenta un peso). El predicado es **idéntico** al
  de (b) — mismo flag, mismos `BASE_DECK_IDS` importados del propio use-case de lista —
  para que fila y compra **nunca** se contradigan. El precio lo cobra el puerto (fuente
  única: `DECK_SETUPS`); el use-case no suma ni resta monedas.
- **(d) UI: fila "?" inerte por construcción** (`ShopScene.renderMysteryDeckRow`): no se
  crean nombre, estado ni botón → sin hitZone, sin click y por lo tanto sin sonido. La
  escena solo dibuja lo que (b) decide. El **contador** "Obtenidos X/Y" usa como
  denominador las entradas **reveladas** (10 mientras chessmaster siga oculto, 11 una vez
  revelado) y, tras comprar el décimo mazo base, la escena re-evalúa `execute()` y
  **re-renderiza el tab** (la "?" se convierte en la fila de chessmaster con precio 30000).
- **(e) Camino defensivo:** si (c) llegara a devolver `locked_prerequisite`, la escena hace
  `flashError` + mensaje temporal de 2,6 s (`SHOP_DECK_LOCKED`, clave i18n nueva —
  **153 → 154 claves**, en + es). **Hoy es inalcanzable desde la UI**: la fila oculta no
  tiene botón y los predicados de (b)/(c) son idénticos. Es **defensa**, no feature viva
  (registrado en `PLAYBOOK.md` §3).

## Consecuencias

- **Añadir un mazo oculto nuevo = declarar el flag** en su entrada de `DeckSetups.ts`:
  lista, prerrequisito y rechazo de compra se actualizan solos — sin tocar use-cases, ni
  `ShopScene`, ni `main.ts`. Añadir un mazo **base** es solo agregar su entrada (las
  entradas de la tienda se derivan de `DECK_SETUP_IDS`, no de una lista pintada a mano).
  El guardián en `DeckSetups.spec` exige que **exactamente un** mazo declare el flag: si el
  producto quiere 2 ocultos, ese test se cambia a propósito.
- **154 claves i18n** (`SHOP_DECK_LOCKED` en `LanguageData.ts`, en + es). El "?" es un
  glifo puntual (Georgia 34 px), no una cadena localizable.
- **Camino defensivo inalcanzable conocido:** `locked_prerequisite` desde la UI no existe
  hoy; documentado en `PLAYBOOK.md` §3 para que un reviewer no lo "arregle" quitándolo ni
  agregue un botón a la fila "?" sin decisión de producto.
- **11 tests nuevos, rojo primero:** `ListAvailableDecksUseCase.spec` (5: orden de las 11
  entradas, oculto con un base faltante, `basic` siempre visible, ya-revelado con todos los
  base, chessmaster poseído con base faltante → visible) +
  `PurchaseDeckUseCase.spec` (6: `locked_prerequisite` sin invocar `purchaseDeck`, colección
  inicial, compra del décimo → chessmaster, `insufficient_coins`/`already_owned` pasan tal
  cual, mazo base sin flag sin chequeo). La compra de mazos queda con **use-case propio**
  (deuda cerrada) y con el mismo patrón que mejoras: `ListAvailable*` decide la fila,
  `Purchase*` decide el rechazo y cobra delegando en el puerto.
- **`ShopScene` sigue sin test** (996 L 🔴): la lógica jugó a la capa testeable, la escena
  quedó en dibujo + orquestación; el hueco se cubre con el **smoke visual**
  (`docs/testing.md` §5, ítem 13, pendiente de ejecutar).
