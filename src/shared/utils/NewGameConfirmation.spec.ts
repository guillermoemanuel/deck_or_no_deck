import { getNewGameWarning } from './NewGameConfirmation';

describe('getNewGameWarning', () => {
  it('no advierte cuando no hay nada que perder', () => {
    expect(getNewGameWarning(0, false, false)).toBe('none');
  });

  it('advierte si hay monedas, mazos comprados o récords (cualquiera de los tres)', () => {
    expect(getNewGameWarning(1500, false, false)).toBe('progress');
    expect(getNewGameWarning(0, true, false)).toBe('progress');
    expect(getNewGameWarning(0, false, true)).toBe('progress');
  });
});
