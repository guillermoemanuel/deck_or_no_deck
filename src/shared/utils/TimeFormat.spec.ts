import { formatShortDuration } from './TimeFormat';

describe('formatShortDuration', () => {
  it('formatea horas y minutos', () => {
    expect(formatShortDuration((5 * 60 + 12) * 60000)).toBe('5h 12m');
  });

  it('omite las horas cuando faltan menos de 60 minutos', () => {
    expect(formatShortDuration(42 * 60000)).toBe('42m');
  });

  it('redondea los minutos hacia arriba', () => {
    expect(formatShortDuration(60 * 60000 - 10000)).toBe('1h 0m');
    expect(formatShortDuration(30000)).toBe('1m');
  });

  it('no devuelve negativos', () => {
    expect(formatShortDuration(-5000)).toBe('<1m');
    expect(formatShortDuration(0)).toBe('<1m');
  });
});
