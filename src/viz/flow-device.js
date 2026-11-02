/*!
 * NoteViz Flow — DeviceLinks.
 * Scope: window.NoteViz.Flow; shared helpers live in flow-core.js.
 * Plain classic script, no modules/network/eval/third-party. Load after flow-core.js.
 */
(function (global) {
  'use strict';

  var NoteViz = global.NoteViz = global.NoteViz || {};
  var shared = global.NoteVizFlowInternals;
  var VERSION = shared && shared.version ? shared.version : '1.0.0';
  if (!shared) throw new Error('NoteViz.Flow DeviceLinks 需要先加载 src/viz/flow-core.js。');
  var text = shared.text, own = shared.own, array = shared.array, isNode = shared.isNode,
    el = shared.el, svgEl = shared.svgEl, setAttrs = shared.setAttrs, setText = shared.setText,
    clear = shared.clear, numberOr = shared.numberOr, clamp = shared.clamp, textOrEmpty = shared.textOrEmpty,
    uniqueId = shared.uniqueId, validateHost = shared.validateHost, defaultId = shared.defaultId,
    component = shared.component, makeSvgAccessible = shared.makeSvgAccessible,
    setViewportMessage = shared.setViewportMessage, normalizeStatus = shared.normalizeStatus,
    statusList = shared.statusList, setAttributeIf = shared.setAttributeIf, setTextIf = shared.setTextIf;

  /* ---------------- DeviceLinks ---------------- */

  var DeviceLinks = {};
  DeviceLinks.version = VERSION;
  DeviceLinks.mount = function (host, options) {
    validateHost(host, 'NoteViz.Flow.DeviceLinks');
    var root = el('div', 'nviz-flow-devicelinks');
    root.setAttribute('role', 'group');
    var viewport = el('div', 'nviz-flow-devicelinks__viewport');
    viewport.tabIndex = 0;
    var svg = svgEl('svg', { class: 'nviz-flow-devicelinks__svg', viewBox: '0 0 1000 300' });
    var note = el('p', 'nviz-flow-devicelinks__note');
    note.hidden = true;
    viewport.appendChild(svg);
    root.append(viewport, note);
    host.appendChild(root);

    var accessible = makeSvgAccessible(svg, '设备连接', '设备、命名端口与连接路径；由宿主提供状态。', 'nviz-flow-devicelinks');
    var linkLayer = svgEl('g', { class: 'nviz-flow-devicelinks__links' });
    var deviceLayer = svgEl('g', { class: 'nviz-flow-devicelinks__devices' });
    svg.append(linkLayer, deviceLayer);

    var model = Object.assign({
      devices: [],
      links: [],
      label: '设备连接'
    }, options || {});

    var deviceNodes = new Map();
    var portNodes = new Map();
    var linkNodes = new Map();
    var linkPaths = new Map();

    function normalizeDevices() {
      return array(model.devices).map(function (source, index) {
        var item = source && typeof source === 'object' && !isNode(source) ? source : {};
        var id = textOrEmpty(item.id) || defaultId('device', index);
        var ports = array(item.ports).map(function (portSource, portIndex) {
          var port = portSource && typeof portSource === 'object' ? portSource : {};
          var portId = textOrEmpty(port.id) || defaultId('port', portIndex);
          return { id: portId, label: port.label == null ? portId : text(port.label) };
        });
        return { id: id, label: item.label == null ? id : text(item.label), status: normalizeStatus(item.status), ports: ports };
      });
    }

    function render() {
      setAttributeIf(root, 'aria-label', textOrEmpty(model.label) || '设备连接');
      setTextIf(accessible.title, textOrEmpty(model.label) || '设备连接');
      var devices = normalizeDevices();
      var deviceIndexById = Object.create(null);
      devices.forEach(function (device, index) { deviceIndexById[device.id] = index; });

      var boxWidth = 168;
      var boxHeight = 82;
      var gap = 28;
      var margin = 26;
      var width = Math.max(720, margin * 2 + devices.length * boxWidth + Math.max(0, devices.length - 1) * gap);
      var top = 24;
      var bottom = top + boxHeight;
      var positions = devices.map(function (device, index) {
        var x = margin + index * (boxWidth + gap);
        var portPositions = Object.create(null);
        device.ports.forEach(function (port, portIndex) {
          var px = x + (boxWidth * (portIndex + 1)) / (device.ports.length + 1);
          portPositions[port.id] = { x: px, y: bottom };
        });
        return { x: x, width: boxWidth, height: boxHeight, ports: portPositions };
      });

      var normalizedLinks = array(model.links).map(function (source, index) {
        var item = source && typeof source === 'object' ? source : {};
        var id = textOrEmpty(item.id) || defaultId('link', index);
        var from = item.from && typeof item.from === 'object' ? item.from : {};
        var to = item.to && typeof item.to === 'object' ? item.to : {};
        var fromDevice = textOrEmpty(from.device || from.deviceId || from[0]);
        var fromPort = textOrEmpty(from.port || from.portId || from[1]);
        var toDevice = textOrEmpty(to.device || to.deviceId || to[0]);
        var toPort = textOrEmpty(to.port || to.portId || to[1]);
        var fromIndex = own(deviceIndexById, fromDevice) ? deviceIndexById[fromDevice] : -1;
        var toIndex = own(deviceIndexById, toDevice) ? deviceIndexById[toDevice] : -1;
        var fromPos = fromIndex >= 0 ? positions[fromIndex].ports[fromPort] : null;
        var toPos = toIndex >= 0 ? positions[toIndex].ports[toPort] : null;
        return {
          id: id,
          fromDevice: fromDevice,
          fromPort: fromPort,
          toDevice: toDevice,
          toPort: toPort,
          fromPos: fromPos || null,
          toPos: toPos || null,
          status: normalizeStatus(item.status),
          label: item.label == null ? '' : text(item.label),
          valid: !!fromPos && !!toPos
        };
      }).filter(function (link) { return link.valid; });
      var invalidLinks = array(model.links).length - normalizedLinks.length;

      var maxLane = bottom + 34 + Math.max(0, normalizedLinks.length - 1) * 22;
      var height = Math.max(240, maxLane + 46);

      var seenDevices = Object.create(null);
      var desiredDeviceLayer = [];
      devices.forEach(function (device, index) {
        var node = deviceNodes.get(device.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-devicelinks__device', 'data-id': device.id });
          node.appendChild(svgEl('rect', { class: 'nviz-flow-devicelinks__device-box', y: top, height: boxHeight, rx: 10 }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-devicelinks__device-label', y: top + 30, 'text-anchor': 'middle' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-devicelinks__device-status', y: top + 50, 'text-anchor': 'middle' }));
          deviceLayer.appendChild(node);
          deviceNodes.set(device.id, node);
        }
        seenDevices[device.id] = true;
        desiredDeviceLayer.push(node);
        var pos = positions[index];
        setAttributeIf(node, 'data-status', device.status || '');
        setAttributeIf(node.querySelector('.nviz-flow-devicelinks__device-box'), 'x', pos.x.toFixed(1));
        setAttributeIf(node.querySelector('.nviz-flow-devicelinks__device-box'), 'width', boxWidth);
        var labelNode = node.querySelector('.nviz-flow-devicelinks__device-label');
        setAttributeIf(labelNode, 'x', (pos.x + boxWidth / 2).toFixed(1));
        setTextIf(labelNode, device.label || device.id);
        var statusNode = node.querySelector('.nviz-flow-devicelinks__device-status');
        setAttributeIf(statusNode, 'x', (pos.x + boxWidth / 2).toFixed(1));
        setTextIf(statusNode, device.status || '');
        var seenPorts = Object.create(null);
        device.ports.forEach(function (port) {
          var key = device.id + ':' + port.id;
          var portPos = pos.ports[port.id];
          var portNode = portNodes.get(key);
          if (!portNode) {
            portNode = svgEl('g', { class: 'nviz-flow-devicelinks__port', 'data-device': device.id, 'data-port': port.id });
            portNode.appendChild(svgEl('circle', { class: 'nviz-flow-devicelinks__port-dot', r: 4 }));
            portNode.appendChild(svgEl('text', { class: 'nviz-flow-devicelinks__port-label', 'text-anchor': 'middle' }));
            deviceLayer.appendChild(portNode);
            portNodes.set(key, portNode);
          }
          seenPorts[key] = true;
          desiredDeviceLayer.push(portNode);
          setAttributeIf(portNode, 'data-id', key);
          setAttributeIf(portNode.querySelector('.nviz-flow-devicelinks__port-dot'), 'cx', portPos.x.toFixed(1));
          setAttributeIf(portNode.querySelector('.nviz-flow-devicelinks__port-dot'), 'cy', portPos.y.toFixed(1));
          var portLabel = portNode.querySelector('.nviz-flow-devicelinks__port-label');
          setAttributeIf(portLabel, 'x', portPos.x.toFixed(1));
          setAttributeIf(portLabel, 'y', (portPos.y - 9).toFixed(1));
          setTextIf(portLabel, port.label || port.id);
        });
        Array.from(portNodes.keys()).forEach(function (key) {
          if (seenPorts[key] || key.indexOf(device.id + ':') !== 0) return;
          var stale = portNodes.get(key);
          if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
          portNodes.delete(key);
        });
      });
      Array.from(deviceNodes.keys()).forEach(function (id) {
        if (seenDevices[id]) return;
        var node = deviceNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        deviceNodes.delete(id);
        Array.from(portNodes.keys()).forEach(function (key) {
          if (key.indexOf(id + ':') !== 0) return;
          var port = portNodes.get(key);
          if (port && port.parentNode) port.parentNode.removeChild(port);
          portNodes.delete(key);
        });
      });
      var currentDeviceLayer = Array.prototype.slice.call(deviceLayer.children);
      if (desiredDeviceLayer.length !== currentDeviceLayer.length ||
          !desiredDeviceLayer.every(function (node, index) { return node === currentDeviceLayer[index]; })) {
        desiredDeviceLayer.forEach(function (node) { deviceLayer.appendChild(node); });
      }
      var seenLinks = Object.create(null);
      var desiredLinks = [];
      normalizedLinks.forEach(function (link, index) {
        var node = linkNodes.get(link.id);
        if (!node) {
          node = svgEl('g', { class: 'nviz-flow-devicelinks__link', 'data-id': link.id });
          node.appendChild(svgEl('path', { class: 'nviz-flow-devicelinks__link-path' }));
          node.appendChild(svgEl('path', { class: 'nviz-flow-devicelinks__link-arrow' }));
          node.appendChild(svgEl('text', { class: 'nviz-flow-devicelinks__link-label', 'text-anchor': 'middle' }));
          linkLayer.appendChild(node);
          linkNodes.set(link.id, node);
          linkPaths.set(link.id, node.querySelector('.nviz-flow-devicelinks__link-path'));
        }
        seenLinks[link.id] = true;
        desiredLinks.push(node);
        var fx = link.fromPos.x;
        var fy = link.fromPos.y;
        var tx = link.toPos.x;
        var ty = link.toPos.y;
        var laneY = bottom + 34 + index * 22;
        var d;
        if (link.fromDevice === link.toDevice && link.fromPort === link.toPort) {
          d = 'M ' + fx.toFixed(1) + ' ' + fy + ' V ' + (laneY - 8) + ' Q ' + fx.toFixed(1) + ' ' + laneY +
            ', ' + (fx + 16).toFixed(1) + ' ' + laneY + ' H ' + (fx + 40).toFixed(1) + ' Q ' + (fx + 56).toFixed(1) + ' ' + laneY +
            ', ' + (fx + 56).toFixed(1) + ' ' + (laneY - 16) + ' V ' + (fy - 8);
        } else {
          d = 'M ' + fx.toFixed(1) + ' ' + fy + ' V ' + (laneY - 6) + ' Q ' + fx.toFixed(1) + ' ' + laneY +
            ', ' + (fx + 6).toFixed(1) + ' ' + laneY + ' H ' + (tx - 6).toFixed(1) + ' Q ' + tx.toFixed(1) + ' ' + laneY +
            ', ' + tx.toFixed(1) + ' ' + (laneY - 6) + ' V ' + ty;
        }
        var path = linkPaths.get(link.id);
        setAttributeIf(path, 'd', d);
        setAttributeIf(node.querySelector('.nviz-flow-devicelinks__link-arrow'), 'd',
          'M ' + (tx - 4).toFixed(1) + ' ' + (ty - 12) + ' L ' + (tx + 4).toFixed(1) + ' ' + (ty - 12) + ' L ' + tx.toFixed(1) + ' ' + (ty - 4) + ' Z');
        var labelNode = node.querySelector('.nviz-flow-devicelinks__link-label');
        setAttributeIf(labelNode, 'x', ((fx + tx) / 2).toFixed(1));
        setAttributeIf(labelNode, 'y', String(laneY - 6));
        setTextIf(labelNode, link.label || (link.fromDevice + ' → ' + link.toDevice));
        setAttributeIf(node, 'data-status', link.status || '');
        setAttributeIf(node, 'data-from-device', link.fromDevice);
        setAttributeIf(node, 'data-from-port', link.fromPort);
        setAttributeIf(node, 'data-to-device', link.toDevice);
        setAttributeIf(node, 'data-to-port', link.toPort);
      });
      Array.from(linkNodes.keys()).forEach(function (id) {
        if (seenLinks[id]) return;
        var node = linkNodes.get(id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        linkNodes.delete(id);
        linkPaths.delete(id);
      });
      var currentLinks = Array.prototype.slice.call(linkLayer.children);
      if (desiredLinks.length !== currentLinks.length ||
          !desiredLinks.every(function (node, index) { return node === currentLinks[index]; })) {
        desiredLinks.forEach(function (node) { linkLayer.appendChild(node); });
      }
      setAttributeIf(svg, 'viewBox', '0 0 ' + width.toFixed(1) + ' ' + height.toFixed(1));
      setViewportMessage(note, invalidLinks ? '已跳过 ' + invalidLinks + ' 条引用未知设备/端口的连接。' : '');
    }

    var instance = component(root, model, render, function () {
      deviceNodes.clear();
      portNodes.clear();
      linkNodes.clear();
      linkPaths.clear();
    });
    instance.getTarget = function (id) {
      if (instance.destroyed || id == null) return null;
      var key = text(id);
      if (key === 'svg') return svg;
      if (key.indexOf('port:') === 0) return portNodes.get(key.slice(5)) || null;
      if (key.indexOf('device:') === 0) return deviceNodes.get(key.slice(7)) || null;
      if (key.indexOf('link:') === 0) return linkNodes.get(key.slice(5)) || null;
      if (deviceNodes.has(key)) return deviceNodes.get(key);
      if (linkNodes.has(key)) return linkNodes.get(key);
      return null;
    };
    instance.getState = function () {
      if (instance.destroyed) return null;
      var devices = normalizeDevices();
      var deviceById = Object.create(null);
      devices.forEach(function (device) {
        var portIds = Object.create(null);
        device.ports.forEach(function (port) { portIds[port.id] = true; });
        deviceById[device.id] = { ports: portIds };
      });
      var links = array(model.links).map(function (source, index) {
        var item = source && typeof source === 'object' ? source : {};
        var from = item.from && typeof item.from === 'object' ? item.from : {};
        var to = item.to && typeof item.to === 'object' ? item.to : {};
        var fromDevice = textOrEmpty(from.device || from.deviceId || from[0]);
        var fromPort = textOrEmpty(from.port || from.portId || from[1]);
        var toDevice = textOrEmpty(to.device || to.deviceId || to[0]);
        var toPort = textOrEmpty(to.port || to.portId || to[1]);
        var fromInfo = deviceById[fromDevice];
        var toInfo = deviceById[toDevice];
        return {
          id: textOrEmpty(item.id) || defaultId('link', index),
          from: { device: fromDevice, port: fromPort },
          to: { device: toDevice, port: toPort },
          label: item.label == null ? '' : text(item.label),
          status: normalizeStatus(item.status),
          valid: !!(fromInfo && fromInfo.ports[fromPort] && toInfo && toInfo.ports[toPort])
        };
      });
      return {
        devices: devices.map(function (device) {
          var ports = Object.create(null);
          device.ports.forEach(function (port) { ports[port.id] = port.label; });
          return { id: device.id, label: device.label, status: device.status, ports: device.ports.map(function (port) { return { id: port.id, label: port.label }; }) };
        }),
        links: links,
        invalidLinks: links.filter(function (link) { return !link.valid; }).length
      };
    };

    instance.getLinkPath = function (id) {
      if (instance.destroyed || id == null) return null;
      var key = text(id);
      var path = linkPaths.get(key) || linkPaths.get(key.replace(/^link:/, ''));
      return path || null;
    };
    instance.pointAt = function (id, ratio) {
      if (instance.destroyed || id == null) return null;
      var path = instance.getLinkPath(id);
      if (!path || typeof path.getTotalLength !== 'function') return null;
      var total = 0;
      try { total = path.getTotalLength(); } catch (error) { return null; }
      if (!(total > 0)) return null;
      var t = clamp(numberOr(ratio, 0), 0, 1);
      var length = total * t;
      var point;
      try { point = path.getPointAtLength(length); } catch (error) { return null; }
      var delta = Math.min(4, total);
      var first = path.getPointAtLength(clamp(length - delta, 0, total));
      var second = path.getPointAtLength(clamp(length + delta, 0, total));
      var angle = Math.atan2(second.y - first.y, second.x - first.x);
      return { x: point.x, y: point.y, angle: angle, length: length, total: total };
    };
    render({});
    return instance;
  };


  NoteViz.Flow = NoteViz.Flow || {};
  NoteViz.Flow.DeviceLinks = DeviceLinks;
})(window);