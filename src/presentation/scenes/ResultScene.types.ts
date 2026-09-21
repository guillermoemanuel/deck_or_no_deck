export type ResultOutcome = 'won' | 'lost';

export interface ResultSceneData {
  readonly outcome: ResultOutcome;
  readonly amount?: number;
  /** BUGFIX (bug_deal_modal_reveal): valor de la Carta Secreta a mostrar en el modal de éxito. */
  readonly secretCardValue?: number;
  readonly onRevive?: () => void | Promise<unknown>;

  // Upgrades de PARTIDA ÚNICA comprados en esta sesión — gatillan qué
  // botones mostrar en el modal de fin de partida (ver
  // GameSceneController.buildUpgradeFlagsForResultScene). Al ser
  // consumibles, no persisten: cada partida arranca sin ninguno.
  readonly hasDoubleReward?: boolean;
  readonly hasTripleReward?: boolean;
  readonly hasReviveUpgrade?: boolean;
}
