/*!
 * NoteViz Flow — public entry/version.
 * Scope: window.NoteViz.Flow. Load after flow-core.js and the four graphic files:
 *   flow-core.js -> flow-stage.js -> flow-packet.js -> flow-segment.js -> flow-device.js -> flow.js
 * flow-core defines shared helpers + NoteViz.Flow.Propagation; the four graphic files define
 * D07-D10. This entry only publishes version/metadata and never starts playback.
 * No network, no eval, no third-party.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var Flow = NoteViz.Flow = NoteViz.Flow || {};

  Flow.version = '1.0.0';
  Flow.parts = ['StageTrack', 'PacketFlow', 'SegmentBar', 'DeviceLinks'];
  Flow.propagation = 'Propagation';
})(window);
