import type { AnnotationSchema, ComponentDef } from './types';

/**
 * Built-in "Rickshaw / E-Rickshaw v1" schema — the FIRST dataset.
 *
 * This is data, not engine logic. It is intentionally the only place the
 * Rickshaw ontology is expressed. Domain accuracy rules baked in here:
 *  - Chain is a SEPARATE component from Pedal / Crank Assembly.
 *  - The round rear part of a rickshaw is "Rear Drive Assembly", NOT a Motor.
 *  - An E-Rickshaw pedal is OPTIONAL (not required when absent).
 */

const ALL_VIS: ComponentDef['allowedVisibilities'] = ['VISIBLE', 'OCCLUDED', 'NOT_VISIBLE'];

function required(key: string, label: string, hint?: string): ComponentDef {
  return { key, label, required: true, box: 'required', allowedVisibilities: ALL_VIS, hint };
}

function optional(key: string, label: string, hint?: string): ComponentDef {
  return { key, label, required: false, box: 'optional', allowedVisibilities: ALL_VIS, hint };
}

export const RICKSHAW_SCHEMA: AnnotationSchema = {
  id: 'rickshaw',
  version: 1,
  name: 'Rickshaw / E-Rickshaw v1',
  description:
    'Bangladeshi rickshaw and e-rickshaw annotation ontology. Annotate major body, structural, mechanical, and electrical components only.',
  classes: [
    {
      key: 'rickshaw',
      label: 'Rickshaw',
      views: [
        {
          key: 'front',
          label: 'Front',
          components: [required('rickshaw_body', 'Rickshaw Body'), required('steering_head', 'Steering Head')],
        },
        {
          key: 'side',
          label: 'Side',
          components: [
            required('rickshaw_body', 'Rickshaw Body'),
            required('pedal_crank_assembly', 'Pedal / Crank Assembly'),
            required('chain', 'Chain', 'A separate box — do not merge into Pedal / Crank Assembly.'),
          ],
        },
        {
          key: 'back',
          label: 'Back',
          components: [
            required('rickshaw_body', 'Rickshaw Body'),
            required(
              'rear_drive_assembly',
              'Rear Drive Assembly',
              'The round rear mechanical part — do NOT classify it as a Motor.',
            ),
          ],
        },
      ],
    },
    {
      key: 'e_rickshaw',
      label: 'E-Rickshaw',
      views: [
        {
          key: 'front',
          label: 'Front',
          components: [
            required('e_rickshaw_body', 'E-Rickshaw Body'),
            required('steering_head', 'Steering Head'),
            required('electric_control_circuit', 'Electric Control / Circuit'),
          ],
        },
        {
          key: 'side',
          label: 'Side',
          components: [
            required('e_rickshaw_body', 'E-Rickshaw Body'),
            required('electric_drive_area', 'Electric Drive Area'),
            optional('pedal', 'Pedal', 'Optional — an e-rickshaw may or may not have a pedal.'),
          ],
        },
        {
          key: 'back',
          label: 'Back',
          components: [
            required('e_rickshaw_body', 'E-Rickshaw Body'),
            required('electric_motor', 'Electric Motor'),
          ],
        },
      ],
    },
  ],
};
