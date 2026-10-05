# Deck or No Deck (speculation-game)

Juego arcade táctico de especulación estilo *Deal or No Deal*, en **TypeScript + Phaser 3**
con **Vite**, pensado para **CrazyGames**. Por partida: 13 cartas (1 secreta + 12 en el
tablero), barra de energía que arranca en 50 %, oferta del banquero cada 3 cartas (nunca
sobre el promedio del tablero), evento de intercambio a mitad de partida y Cambio Final.
El progreso (monedas, mejoras de partida única, mazos coleccionables, récords, desafío
diario, bono periódico, idioma) persiste en `localStorage`. Interfaz en **EN/ES**.

## Levantar

```bash
npm install
npm run dev        # vite dev server
npm run build      # tsc --noEmit && vite build
npm run preview    # sirve el build
```

## Gates

Runner: **Jest** — specs `*.spec.ts` junto a cada archivo (no existe `vitest`).

```bash
npx jest <ruta>        # test selectivo — usar SIEMPRE durante un cambio
npm test               # suite completa
npm run typecheck      # tsc --noEmit (incluye los specs)
npm run lint           # eslint src
npm run test:coverage  # cobertura por capa (umbrales en jest.config.js)
```

## Estructura

```
src/
├── domain/           reglas de negocio puras — sin dependencias ni Phaser
├── application/      use-cases, factory, records, onboarding
├── infrastructure/   adaptadores: localStorage, SDK CrazyGames, audio
├── presentation/     Phaser: escenas, componentes, GameSceneController, efectos
├── shared/           i18n (en/es), SimpleEventEmitter, utils
└── main.ts           composition root global (por partida: GameScene)

docs/                 ARCHITECTURE · MAP · PLAYBOOK · testing · LOG · DECISIONS/
.opencode/            agentes y comandos de OpenCode del proyecto
public/assets/        texturas y audio
```

## Documentación

- **`AGENTS.md`** — contrato operativo: comandos, invariantes numéricos, archivos de alto
  riesgo, reglas de eventos/i18n y gates. **Leer antes de tocar nada.**
- `docs/ARCHITECTURE.md` — cómo está construido: capas, composition roots, puertos,
  invariantes. Fuente de verdad viva.
- `docs/PLAYBOOK.md` — duplicaciones, código muerto, contratos frágiles y trampas ya
  conocidas. **Leer antes de crear algo nuevo.**
- `docs/MAP.md` — censo por archivo: líneas, specs, peligrosidad.
- `docs/testing.md` — política de tests, dobles, cobertura y huecos de smoke.
- `docs/LOG.md` — bitácora append-only de sesiones: el estado reciente vive acá.
- `docs/DECISIONS/` — ADRs (contexto · decisión · consecuencias).

## Agentes

Las tareas se reparten entre agentes de OpenCode: definiciones en `.opencode/agents/`
(arquitecto, builders por capa, test-engineer, reviewer, qa, memory-keeper) y comandos en
`.opencode/commands/` (`/plan`, `/build`, `/review`, `/qa`, `/log`).
