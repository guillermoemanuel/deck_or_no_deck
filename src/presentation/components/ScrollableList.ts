import Phaser from 'phaser';
import { clampScrollOffset } from '../layout/ShopLayout';

/**
 * Opciones de construcción: `(x, y)` es el CENTRO del sistema de
 * coordenadas del CONTENIDO (los hijos que la escena agrega a
 * `contentContainer` usan este origen, p. ej. el centro del panel modal de
 * la Tienda); la ventana visible es un rectángulo de `width × height` cuyo
 * centro está a `windowOffsetY` por debajo de ese origen (0 = ventana
 * centrada en el origen). La máscara recorta SOLO la renderización, no el
 * input.
 */
export interface ScrollableListOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Centro vertical de la ventana visible, RELATIVO a `y`. */
  readonly windowOffsetY: number;
}

/** Umbral de arrastre (px de diseño): por debajo, el pointer es un click. */
/**
 * Umbral en px (diseño) por debajo del cual un pointerup cuenta como
 * click y no como fin de arrastre — fuente única compartida con la zona
 * de botones de ShopScene (que necesita el mismo número para su guard
 * anti-click-fantasma).
 */
export const DRAG_THRESHOLD_PX = 8;
/** Paso de rueda del ratón (px de diseño por tick de `deltaY`). */
const WHEEL_STEP_PX = 40;

/**
 * Forma estructural mínima que necesita el recorte de input: la clase base
 * `GameObject` de `phaser.d.ts` NO declara `visible`/`getBounds` (vienen de
 * los mixins de componentes), y hay hijos sin `getBounds` (Graphics) que se
 * saltan — son invisibles para el hit-test solo si no tienen input, y de
 * todos modos la máscara ya los oculta.
 */
interface ClipChild {
  readonly visible: boolean;
  setVisible(value: boolean): unknown;
  getBounds?(output?: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle;
}

/**
 * ScrollableList: contenedor reutilizable de scroll vertical para listas
 * dentro de un modal Phaser (componente COMPARTIDO — primer uso:
 * ShopScene en modo compacto; candidatos futuros: BankerOfferPanel, etc.).
 *
 * Estructura: un Container EXTERNO posicionado en (x, y) con máscara de
 * geometría (rectángulo de la ventana visible), que contiene un Container
 * interno `content` cuyo `.y = -offset` es el scroll. Los hijos se
 * agregan directo a `contentContainer` usando las coordenadas LOCALES del
 * origen (centro del panel), y `setContentHeight()` define la altura total
 * del contenido (la base del tope de scroll) — la escena lo llama SIEMPRE
 * al final de pintar, que es también cuando se re-valida el clip de input.
 *
 * Input:
 * - Rueda del ratón sobre la ventana (zona interactiva propia). Ojo: al
 *   usar `topOnly` (default de Phaser), si el puntero está sobre un botón
 *   de FILA (más arriba en la z-order) la rueda no llega a la zona — se
 *   scrollea desde el texto/vacío de la fila, que es donde casi siempre
 *   está el puntero.
 * - Arrastre vertical (mouse/touch): NO usa `setDraggable` sobre la zona,
 *   porque un pointerdown que cae sobre un botón de fila (arriba en la
 *   z-order) no llegaría nunca a la zona y el arrastre no arrancaría.
 *   En su lugar se escucha `scene.input` a nivel de PLUGIN (siempre
 *   dispara) y se chequea el bounds de la ventana a mano. El umbral de
 *   8 px es LOCAL al componente — no toca `input.dragDistanceThreshold`
 *   global (así no hay riesgo de restaurar un valor viejo si conviven
 *   varias listas o la escena muere a mitad de drag).
 * - Anti click-fantasma: al cruzar el umbral se levanta `wasDragging()`
 *   y el flag vive hasta el PRÓXIMO `pointerdown`. Los botones hijos
 *   consultan ese flag en su `pointerup` (Phaser despacha los pointerup
 *   de los game objects antes de cualquier down posterior), así que
 *   arrastrar y soltar SOBRE un botón NO dispara su acción.
 * - Recorte de input a la ventana: la máscara solo corta el DIBUJO.
 *   Phaser hit-testea por bounds de MUNDO y no consulta masks, así que un
 *   botón scrolleado fuera del área (p. ej. sobre el ✕ o sobre el fondo
 *   del modal) seguiría siendo clicable. Ver `syncInputToWindow()`.
 */
export class ScrollableList {
  /** Container externo (posicionado en el origen) — agregarlo a la escena/container destino. */
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly options: ScrollableListOptions;
  private readonly content: Phaser.GameObjects.Container;
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly hitZone: Phaser.GameObjects.Zone;

  private offset = 0;
  private contentHeight = 0;
  /** ¿Hay que re-cortar el input? (falso = el clip ya refleja el estado actual). */
  private clipDirty = true;
  /** Hijos que OCULTÓ este clip — solo ellos se restauran al volver a entrar
   * (un hijo que la escena ocultó a propósito no se le toca). */
  private readonly clipHidden = new Set<ClipChild>();

  /** Rects reutilizados por `syncInputToWindow()` — sin alocar por frame. */
  private readonly bounds = new Phaser.Geom.Rectangle();
  private readonly windowRect = new Phaser.Geom.Rectangle();
  private dragPointer: Phaser.Input.Pointer | null = null;
  private dragStartY = 0;
  private dragStartOffset = 0;
  private dragging = false;
  private wasDragFlag = false;

  constructor(scene: Phaser.Scene, options: ScrollableListOptions) {
    this.scene = scene;
    this.options = options;
    const { x, y, width, height, windowOffsetY } = options;

    this.container = scene.add.container(x, y);
    this.content = scene.add.container(0, 0);
    // Zona de rueda PRIMERO (índice 0): así los botones de fila —dentro
    // de `content`, agregado después— quedan arriba en la z-order y
    // reciben los clicks antes que la zona.
    this.hitZone = scene.add.zone(0, windowOffsetY, width, height).setInteractive();
    this.container.add(this.hitZone);
    this.container.add(this.content);

    // Máscara de geometría: el shape vive en coordenadas de MUNDO (no
    // dentro del container) y NO se agrega a la display list — solo
    // alimenta el stencil. Se destruye explícitamente en destroy().
    this.maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
    this.maskShape.fillStyle(0xffffff, 1);
    this.maskShape.fillRect(x - width / 2, y + windowOffsetY - height / 2, width, height);
    this.container.setMask(this.maskShape.createGeometryMask());

    this.hitZone.on('wheel', this.onMouseWheel);
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
  }

  /** Container interno donde viven las filas (coords locales relativas al origen) — es el mismo `parent` que la escena le pasa a sus render* de fila. */
  get contentContainer(): Phaser.GameObjects.Container {
    return this.content;
  }

  /** Altura total del contenido en px — define el tope de scroll. Es
   * también el punto donde se re-valida el clip de input: la escena lo
   * llama SIEMPRE al final de pintar las filas. */
  setContentHeight(px: number): void {
    this.contentHeight = px;
    this.clipDirty = true; // el contenido cambió: re-valida el clip aunque el offset no
    this.setOffset(this.offset); // re-clampa + re-valida el input (abajo)
  }

  getOffset(): number {
    return this.offset;
  }

  /** Desplaza el contenido (0 = arriba del todo), siempre clamped. */
  setOffset(px: number): void {
    const clamped = clampScrollOffset(px, this.contentHeight - this.options.height);
    if (clamped !== this.offset) {
      this.offset = clamped;
      this.content.y = -clamped;
      // Los hijos cambiaron de posición respecto de la ventana ⇒ hay que
      // re-validar el clip de input (si no se movió, no hay nada que hacer).
      this.clipDirty = true;
    }
    this.syncInputToWindow();
  }

  /** ¿El último pointerup fue la cola de un arrastre? Ver JSDoc de la clase. */
  wasDragging(): boolean {
    return this.wasDragFlag;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.hitZone.off('wheel', this.onMouseWheel);
    this.hitZone.destroy();
    this.container.clearMask(true); // destruye la GeometryMask
    this.maskShape.destroy();
    this.container.destroy(true); // destruye content + filas
    this.clipHidden.clear();
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------

  private readonly onMouseWheel = (_pointer: Phaser.Input.Pointer, _deltaX: number, deltaY: number): void => {
    // Rueda hacia abajo (deltaY positivo en los navegadores) ⇒ el contenido
    // sube ⇒ el offset crece.
    this.setOffset(this.offset + deltaY * WHEEL_STEP_PX);
  };

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    // Solo el primer dedo/pointer de la GESTA: si el anterior quedó
    // huérfano (up perdido, p. ej. `touchcancel` sin dispatch) ya no está
    // `isDown` y se descarta acá — sin ese chequeo el drag no volvería a
    // arrancar nunca más.
    if (this.dragPointer && this.dragPointer.isDown) return;
    this.dragPointer = null;
    this.dragging = false;
    // Un pointerdown NUEVO limpia el flag del arrastre anterior — así
    // llega vivo al pointerup de los botones hijos el MISMO gesto que lo
    // levantó, y el siguiente click no arrastra la marca vieja. Se hace
    // ANTES de chequear la ventana para que el contrato ("vive hasta el
    // próximo pointerdown") sea cierto aunque ese down caiga fuera: un
    // arrastre que empiece fuera de la ventana lo cubre la red de
    // seguridad de la escena (caída vertical del pointer).
    this.wasDragFlag = false;
    if (!this.isInsideWindow(pointer.x, pointer.y)) return;
    this.dragPointer = pointer;
    this.dragStartY = pointer.y;
    this.dragStartOffset = this.offset;
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.dragPointer !== pointer) return;
    const delta = this.dragStartY - pointer.y; // dedo hacia arriba ⇒ positivo
    if (!this.dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      this.dragging = true;
      this.wasDragFlag = true;
    }
    this.setOffset(this.dragStartOffset + delta);
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.dragPointer !== pointer) return;
    this.dragPointer = null;
    this.dragging = false;
    // wasDragFlag NO se limpia acá: los botones hijos lo consultan en su
    // pointerup (mismo frame); se limpia en el próximo pointerdown.
  };

  private isInsideWindow(worldX: number, worldY: number): boolean {
    const { x, y, width, height, windowOffsetY } = this.options;
    return (
      worldX >= x - width / 2 &&
      worldX <= x + width / 2 &&
      worldY >= y + windowOffsetY - height / 2 &&
      worldY <= y + windowOffsetY + height / 2
    );
  }

  /**
   * Recorta el INPUT a la ventana. La máscara de geometría solo corta el
   * DIBUJO y Phaser hit-testea por bounds de MUNDO sin consultar masks, así
   * que un botón scrolleado fuera del área seguiría siendo clicable sobre
   * el ✕ o sobre el fondo del modal. Los hijos cuyo bounds NO solapan la
   * ventana pasan a `setVisible(false)`: `InputManager.inputCandidate`
   * excluye del hit-test lo que no `willRender()` y desciende por la cadena
   * de padres, con lo que también caen las zonas dentro de un Container
   * hijo (nunca se toca `input.enabled`, que comparte estado con
   * `disableInteractive()`/`setInteractive()` de la escena).
   *
   * Los bounds de los hijos son de MUNDO (`getBounds` aplica la cadena de
   * parentContainers) y por eso se comparan contra la ventana en MUNDO; un
   * hijo sin `getBounds` (Graphics) se salta: sin input propio, la máscara
   * ya basta. Al re-entrar a la ventana se restaura SOLO lo que ocultó este
   * método (`clipHidden`) — un hijo que la escena ocultó a propósito sigue
   * oculto. Corre solo con cambios pendientes (`clipDirty`), no por frame.
   */
  private syncInputToWindow(): void {
    if (!this.clipDirty) return;
    this.clipDirty = false;

    const { x, y, width, height, windowOffsetY } = this.options;
    this.windowRect.setTo(x - width / 2, y + windowOffsetY - height / 2, width, height);

    const children = this.content.list;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as unknown as ClipChild;
      // `getBounds` es opcional en el TIPO (hay hijos Graphics sin él): se
      // baja a una const para que el guard deje el tipo sin `undefined`.
      const getBounds = child.getBounds;
      if (typeof child.setVisible !== 'function' || typeof getBounds !== 'function') continue;
      const childBounds = getBounds.call(child, this.bounds);
      if (Phaser.Geom.Rectangle.Overlaps(childBounds, this.windowRect)) {
        if (this.clipHidden.delete(child)) {
          child.setVisible(true);
        }
      } else if (child.visible) {
        this.clipHidden.add(child);
        child.setVisible(false);
      }
    }
  }
}
