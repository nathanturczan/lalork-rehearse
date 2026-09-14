// Vendored copy of strudel-scalenav/scales.js (57-scale registry: root,
// pitch_classes, scale_class). Used to resolve Harmony Payload v2 scaleInfo
// for registry scales so every broadcast is self-describing (no separate
// standard/custom code paths on the wire).
const ScaleData = {
  "a_acoustic": {
    "root": 9,
    "pitch_classes": [
      1,
      3,
      4,
      6,
      7,
      9,
      11
    ],
    "scale_class": "acoustic"
  },
  "a_diatonic": {
    "root": 9,
    "pitch_classes": [
      1,
      2,
      4,
      6,
      8,
      9,
      11
    ],
    "scale_class": "diatonic"
  },
  "a_harmonic_major": {
    "root": 9,
    "pitch_classes": [
      1,
      2,
      4,
      5,
      8,
      9,
      11
    ],
    "scale_class": "harmonic_major"
  },
  "a_harmonic_minor": {
    "root": 9,
    "pitch_classes": [
      0,
      2,
      4,
      5,
      8,
      9,
      11
    ],
    "scale_class": "harmonic_minor"
  },
  "as_acoustic": {
    "root": 10,
    "pitch_classes": [
      0,
      2,
      4,
      5,
      7,
      8,
      10
    ],
    "scale_class": "acoustic"
  },
  "as_diatonic": {
    "root": 10,
    "pitch_classes": [
      0,
      2,
      3,
      5,
      7,
      9,
      10
    ],
    "scale_class": "diatonic"
  },
  "as_harmonic_major": {
    "root": 10,
    "pitch_classes": [
      0,
      2,
      3,
      5,
      6,
      9,
      10
    ],
    "scale_class": "harmonic_major"
  },
  "as_harmonic_minor": {
    "root": 10,
    "pitch_classes": [
      0,
      1,
      3,
      5,
      6,
      9,
      10
    ],
    "scale_class": "harmonic_minor"
  },
  "b_acoustic": {
    "root": 11,
    "pitch_classes": [
      1,
      3,
      5,
      6,
      8,
      9,
      11
    ],
    "scale_class": "acoustic"
  },
  "b_diatonic": {
    "root": 11,
    "pitch_classes": [
      1,
      3,
      4,
      6,
      8,
      10,
      11
    ],
    "scale_class": "diatonic"
  },
  "b_harmonic_major": {
    "root": 11,
    "pitch_classes": [
      1,
      3,
      4,
      6,
      7,
      10,
      11
    ],
    "scale_class": "harmonic_major"
  },
  "b_harmonic_minor": {
    "root": 11,
    "pitch_classes": [
      1,
      2,
      4,
      6,
      7,
      10,
      11
    ],
    "scale_class": "harmonic_minor"
  },
  "c_acoustic": {
    "root": 0,
    "pitch_classes": [
      0,
      2,
      4,
      6,
      7,
      9,
      10
    ],
    "scale_class": "acoustic"
  },
  "c_diatonic": {
    "root": 0,
    "pitch_classes": [
      0,
      2,
      4,
      5,
      7,
      9,
      11
    ],
    "scale_class": "diatonic"
  },
  "c_harmonic_major": {
    "root": 0,
    "pitch_classes": [
      0,
      2,
      4,
      5,
      7,
      8,
      11
    ],
    "scale_class": "harmonic_major"
  },
  "c_harmonic_minor": {
    "root": 0,
    "pitch_classes": [
      0,
      2,
      3,
      5,
      7,
      8,
      11
    ],
    "scale_class": "harmonic_minor"
  },
  "cs_acoustic": {
    "root": 1,
    "pitch_classes": [
      1,
      3,
      5,
      7,
      8,
      10,
      11
    ],
    "scale_class": "acoustic"
  },
  "cs_diatonic": {
    "root": 1,
    "pitch_classes": [
      0,
      1,
      3,
      5,
      6,
      8,
      10
    ],
    "scale_class": "diatonic"
  },
  "cs_harmonic_major": {
    "root": 1,
    "pitch_classes": [
      0,
      1,
      3,
      5,
      6,
      8,
      9
    ],
    "scale_class": "harmonic_major"
  },
  "cs_harmonic_minor": {
    "root": 1,
    "pitch_classes": [
      0,
      1,
      3,
      4,
      6,
      8,
      9
    ],
    "scale_class": "harmonic_minor"
  },
  "d_acoustic": {
    "root": 2,
    "pitch_classes": [
      0,
      2,
      4,
      6,
      8,
      9,
      11
    ],
    "scale_class": "acoustic"
  },
  "d_diatonic": {
    "root": 2,
    "pitch_classes": [
      1,
      2,
      4,
      6,
      7,
      9,
      11
    ],
    "scale_class": "diatonic"
  },
  "d_harmonic_major": {
    "root": 2,
    "pitch_classes": [
      1,
      2,
      4,
      6,
      7,
      9,
      10
    ],
    "scale_class": "harmonic_major"
  },
  "d_harmonic_minor": {
    "root": 2,
    "pitch_classes": [
      1,
      2,
      4,
      5,
      7,
      9,
      10
    ],
    "scale_class": "harmonic_minor"
  },
  "ds_acoustic": {
    "root": 3,
    "pitch_classes": [
      0,
      1,
      3,
      5,
      7,
      9,
      10
    ],
    "scale_class": "acoustic"
  },
  "ds_diatonic": {
    "root": 3,
    "pitch_classes": [
      0,
      2,
      3,
      5,
      7,
      8,
      10
    ],
    "scale_class": "diatonic"
  },
  "ds_harmonic_major": {
    "root": 3,
    "pitch_classes": [
      2,
      3,
      5,
      7,
      8,
      10,
      11
    ],
    "scale_class": "harmonic_major"
  },
  "ds_harmonic_minor": {
    "root": 3,
    "pitch_classes": [
      2,
      3,
      5,
      6,
      8,
      10,
      11
    ],
    "scale_class": "harmonic_minor"
  },
  "e_acoustic": {
    "root": 4,
    "pitch_classes": [
      1,
      2,
      4,
      6,
      8,
      10,
      11
    ],
    "scale_class": "acoustic"
  },
  "e_diatonic": {
    "root": 4,
    "pitch_classes": [
      1,
      3,
      4,
      6,
      8,
      9,
      11
    ],
    "scale_class": "diatonic"
  },
  "e_harmonic_major": {
    "root": 4,
    "pitch_classes": [
      0,
      3,
      4,
      6,
      8,
      9,
      11
    ],
    "scale_class": "harmonic_major"
  },
  "e_harmonic_minor": {
    "root": 4,
    "pitch_classes": [
      0,
      3,
      4,
      6,
      7,
      9,
      11
    ],
    "scale_class": "harmonic_minor"
  },
  "f_acoustic": {
    "root": 5,
    "pitch_classes": [
      0,
      2,
      3,
      5,
      7,
      9,
      11
    ],
    "scale_class": "acoustic"
  },
  "f_diatonic": {
    "root": 5,
    "pitch_classes": [
      0,
      2,
      4,
      5,
      7,
      9,
      10
    ],
    "scale_class": "diatonic"
  },
  "f_harmonic_major": {
    "root": 5,
    "pitch_classes": [
      0,
      1,
      4,
      5,
      7,
      9,
      10
    ],
    "scale_class": "harmonic_major"
  },
  "f_harmonic_minor": {
    "root": 5,
    "pitch_classes": [
      0,
      1,
      4,
      5,
      7,
      8,
      10
    ],
    "scale_class": "harmonic_minor"
  },
  "fs_acoustic": {
    "root": 6,
    "pitch_classes": [
      0,
      1,
      3,
      4,
      6,
      8,
      10
    ],
    "scale_class": "acoustic"
  },
  "fs_diatonic": {
    "root": 6,
    "pitch_classes": [
      1,
      3,
      5,
      6,
      8,
      10,
      11
    ],
    "scale_class": "diatonic"
  },
  "fs_harmonic_major": {
    "root": 6,
    "pitch_classes": [
      1,
      2,
      5,
      6,
      8,
      10,
      11
    ],
    "scale_class": "harmonic_major"
  },
  "fs_harmonic_minor": {
    "root": 6,
    "pitch_classes": [
      1,
      2,
      5,
      6,
      8,
      9,
      11
    ],
    "scale_class": "harmonic_minor"
  },
  "g_acoustic": {
    "root": 7,
    "pitch_classes": [
      1,
      2,
      4,
      5,
      7,
      9,
      11
    ],
    "scale_class": "acoustic"
  },
  "g_diatonic": {
    "root": 7,
    "pitch_classes": [
      0,
      2,
      4,
      6,
      7,
      9,
      11
    ],
    "scale_class": "diatonic"
  },
  "g_harmonic_major": {
    "root": 7,
    "pitch_classes": [
      0,
      2,
      3,
      6,
      7,
      9,
      11
    ],
    "scale_class": "harmonic_major"
  },
  "g_harmonic_minor": {
    "root": 7,
    "pitch_classes": [
      0,
      2,
      3,
      6,
      7,
      9,
      10
    ],
    "scale_class": "harmonic_minor"
  },
  "gs_acoustic": {
    "root": 8,
    "pitch_classes": [
      0,
      2,
      3,
      5,
      6,
      8,
      10
    ],
    "scale_class": "acoustic"
  },
  "gs_diatonic": {
    "root": 8,
    "pitch_classes": [
      0,
      1,
      3,
      5,
      7,
      8,
      10
    ],
    "scale_class": "diatonic"
  },
  "gs_harmonic_major": {
    "root": 8,
    "pitch_classes": [
      0,
      1,
      3,
      4,
      7,
      8,
      10
    ],
    "scale_class": "harmonic_major"
  },
  "gs_harmonic_minor": {
    "root": 8,
    "pitch_classes": [
      1,
      3,
      4,
      7,
      8,
      10,
      11
    ],
    "scale_class": "harmonic_minor"
  },
  "octatonic_1": {
    "root": 0,
    "pitch_classes": [
      0,
      1,
      3,
      4,
      6,
      7,
      9,
      10
    ],
    "scale_class": "octatonic"
  },
  "octatonic_2": {
    "root": 1,
    "pitch_classes": [
      1,
      2,
      4,
      5,
      7,
      8,
      10,
      11
    ],
    "scale_class": "octatonic"
  },
  "octatonic_3": {
    "root": 2,
    "pitch_classes": [
      0,
      2,
      3,
      5,
      6,
      8,
      9,
      11
    ],
    "scale_class": "octatonic"
  },
  "hexatonic_1": {
    "root": 1,
    "pitch_classes": [
      0,
      1,
      4,
      5,
      8,
      9
    ],
    "scale_class": "hexatonic"
  },
  "hexatonic_2": {
    "root": 2,
    "pitch_classes": [
      1,
      2,
      5,
      6,
      9,
      10
    ],
    "scale_class": "hexatonic"
  },
  "hexatonic_3": {
    "root": 3,
    "pitch_classes": [
      2,
      3,
      6,
      7,
      10,
      11
    ],
    "scale_class": "hexatonic"
  },
  "hexatonic_4": {
    "root": 4,
    "pitch_classes": [
      0,
      3,
      4,
      7,
      8,
      11
    ],
    "scale_class": "hexatonic"
  },
  "whole_tone_1": {
    "root": 0,
    "pitch_classes": [
      0,
      2,
      4,
      6,
      8,
      10
    ],
    "scale_class": "whole_tone"
  },
  "whole_tone_2": {
    "root": 1,
    "pitch_classes": [
      1,
      3,
      5,
      7,
      9,
      11
    ],
    "scale_class": "whole_tone"
  }
};
export default ScaleData;
