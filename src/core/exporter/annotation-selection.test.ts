import { describe, expect, it } from 'vitest';
import { getExportableAnnotations } from './annotation-selection';

describe('getExportableAnnotations', () => {
  it('exports visible and occluded boxes and explicitly reports not-visible exclusions', () => {
    const selection = getExportableAnnotations([
      { id: 'visible', visibility: 'VISIBLE' },
      { id: 'occluded', visibility: 'OCCLUDED' },
      { id: 'hidden', visibility: 'NOT_VISIBLE' },
    ]);
    expect(selection.exportable.map((box) => box.id)).toEqual(['visible', 'occluded']);
    expect(selection.excluded.map((box) => box.id)).toEqual(['hidden']);
    expect(selection.excludedByReason).toEqual({ NOT_VISIBLE: 1 });
  });

  it('preserves duplicate component boxes as separate object instances', () => {
    const selection = getExportableAnnotations([
      { id: 'rickshaw-1', componentKey: 'body', visibility: 'VISIBLE' },
      { id: 'rickshaw-2', componentKey: 'body', visibility: 'VISIBLE' },
      { id: 'electric-1', componentKey: 'body', visibility: 'OCCLUDED' },
    ]);
    expect(selection.exportable).toHaveLength(3);
  });
});
