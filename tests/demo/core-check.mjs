import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { moduleScripts } from '../lib/src-sources.mjs';

const require = createRequire(new URL('../tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');

const checkDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(checkDir, '..', '..');
const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// 从 src/manifests 推导加载顺序：demo-runtime 拆分新增文件后无需手改清单。
const SCRIPTS = moduleScripts(projectDir, ['core', 'demo-runtime']);

let checks = 0;
const pageErrors = [];

function fail(message) {
  throw new Error('CHECK FAILED: ' + message);
}

async function runGroup(name, fn) {
  let results;
  try {
    results = await fn();
  } catch (error) {
    fail(name + ' 执行异常：' + (error && error.stack ? error.stack : error));
  }
  if (!Array.isArray(results)) fail(name + ' 没有返回结果数组');
  const failures = [];
  for (const item of results) {
    if (item.ok) {
      checks += 1;
      console.log('ok ' + checks + ' - ' + item.name);
    } else {
      failures.push(item);
    }
  }
  if (failures.length) {
    fail(name + ' 有 ' + failures.length + ' 项失败：\n' +
      failures.map((item) => '  - ' + item.name + '\n    ' + String(item.error || '').split('\n').join('\n    ')).join('\n'));
  }
}

const installHelpers = () => {
  const Internals = window.NoteDemoInternals;
  const T = {};

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  T.isObject = isObject;

  T.assert = function (condition, message) {
    if (!condition) throw new Error(message || '断言失败');
  };

  T.eq = function (actual, expected, message) {
    if (!Object.is(actual, expected)) {
      throw new Error((message || 'eq') + '：expected ' + JSON.stringify(expected) + '，actual ' + JSON.stringify(actual));
    }
  };

  const stableStringify = (value) => {
    if (value === undefined) return '"__undefined__"';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  };
  T.deq = function (actual, expected, message) {
    const left = stableStringify(actual);
    const right = stableStringify(expected);
    if (left !== right) throw new Error((message || 'deq') + '：expected ' + right + '，actual ' + left);
  };

  T.throws = function (fn, matcher, message) {
    let caught = null;
    try {
      fn();
    } catch (error) {
      caught = error;
    }
    if (!caught) throw new Error((message || 'throws') + '：没有抛出错误');
    if (matcher) {
      const outcome = matcher(caught);
      if (outcome === false) {
        throw new Error((message || 'throws') + '：错误不匹配（' + String(caught && caught.message) + '）');
      }
    }
    return caught;
  };

  T.wait = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  T.uid = (function () {
    let count = 0;
    return function (prefix) {
      count += 1;
      return (prefix || 'u') + count;
    };
  })();

  /* ---------------- 假 Adapter ---------------- */

  T.makeAdapter = function (name, config) {
    config = config || {};
    const records = {
      name: name,
      mounts: 0,
      adopts: 0,
      handleDestroys: 0,
      restores: 0,
      applyCues: 0,
      readViews: 0,
      performs: [],
      cancels: 0,
      instances: [],
      adoptedInstances: []
    };

    function copyItems(items) {
      return (Array.isArray(items) ? items : []).map(function (item) {
        return { id: String(item.id), label: item.label == null ? '' : String(item.label) };
      });
    }

    function normalizeIdList(value) {
      const output = [];
      (Array.isArray(value) ? value : []).forEach(function (entry) {
        const id = String(entry);
        if (output.indexOf(id) < 0) output.push(id);
      });
      output.sort();
      return output;
    }

    function normalizeView(input) {
      if (!isObject(input)) throw new Error('fake[' + name + ']：view 必须是 {items?,text?,focus?,changed?} 对象');
      const items = copyItems(input.items);
      const seen = {};
      items.forEach(function (item) {
        if (!item.id) throw new Error('fake[' + name + ']：items.id 不能为空');
        if (seen[item.id]) throw new Error('fake[' + name + ']：items.id 重复 ' + item.id);
        seen[item.id] = true;
      });
      const model = { items: items, text: input.text == null ? '' : String(input.text) };
      return {
        model: model,
        cues: { focus: normalizeIdList(input.focus), changed: normalizeIdList(input.changed) }
      };
    }

    const ALLOWED = ['remove', 'swap', 'set', 'slow', 'mismatch', 'cuemismatch', 'nop', 'fail', 'selfcancel'];

    function validateAction(action) {
      if (!isObject(action)) throw new Error('fake：action 必须是对象');
      if (action.type === 'unsupported') throw new Error('fake：不支持动作 type "unsupported"');
      if (ALLOWED.indexOf(action.type) < 0) throw new Error('fake：未知动作类型 ' + JSON.stringify(action.type));
      if (action.type === 'remove' && (!isObject(action.params) || action.params.id == null)) {
        throw new Error('fake：remove 缺少 params.id');
      }
      if (action.type === 'swap' && (!isObject(action.params) || action.params.a == null || action.params.b == null)) {
        throw new Error('fake：swap 缺少 params.a / params.b');
      }
      if (action.type === 'set' && (!isObject(action.params) || typeof action.params.text !== 'string')) {
        throw new Error('fake：set 缺少 params.text');
      }
    }

    function makeHandle(host, mountConfig) {
      const root = document.createElement('div');
      root.className = 'fake-adapter';
      root.setAttribute('data-fake', name);
      const textEl = document.createElement('span');
      textEl.className = 'fake-text';
      root.appendChild(textEl);
      host.appendChild(root);
      const store = { items: [], text: '', focus: [], changed: [] };
      const handle = { destroyed: false };
      records.instances.push({ handle: handle, store: store, root: root });

      function render() {
        textEl.textContent = store.text + '|' +
          store.items.map(function (item) { return item.id; }).join(',') + '|f:' + store.focus.join(',') + '|c:' + store.changed.join(',');
        root.setAttribute('data-value', textEl.textContent);
      }

      function applyModel(model) {
        if (!isObject(model)) return;
        store.items = copyItems(model.items);
        store.text = model.text == null ? '' : String(model.text);
      }

      function applyCueSet(cues) {
        if (!isObject(cues)) return;
        store.focus = normalizeIdList(cues.focus);
        store.changed = normalizeIdList(cues.changed);
      }

      handle.restore = function (view) {
        if (handle.destroyed) return;
        records.restores += 1;
        if (config.restoreThrowsAfter != null && records.restores > config.restoreThrowsAfter) {
          throw new Error('fake[' + name + ']：restore 失败（测试注入）');
        }
        applyModel(view && view.model);
        applyCueSet(view && view.cues);
        render();
      };
      handle.readView = function () {
        if (handle.destroyed) return null;
        records.readViews += 1;
        return {
          model: { items: copyItems(store.items), text: store.text },
          cues: { focus: store.focus.slice(), changed: store.changed.slice() }
        };
      };
      handle.applyCues = function (cues) {
        if (handle.destroyed) return;
        records.applyCues += 1;
        if (!config.ignoreCues && !(mountConfig && mountConfig.ignoreCues)) applyCueSet(cues);
      };
      handle.perform = function (action, ctx) {
        if (handle.destroyed) throw new Error('fake：handle 已销毁');
        const entry = { action: action, ctx: ctx, cancelled: false };
        records.performs.push(entry);
        const params = isObject(action.params) ? action.params : {};
        let delay = params.delay == null ? 0 : Number(params.delay);
        if (!isFinite(delay) || delay < 0) delay = 0;
        if (ctx && ctx.motion === 'reduced') delay = 0;
        const ignoreCancel = !!(config.ignoreCancel || params.ignoreCancel);
        let settled = false;
        let timer = 0;
        let resolveFinished;
        let rejectFinished;
        const finished = new Promise(function (resolve, reject) {
          resolveFinished = resolve;
          rejectFinished = reject;
        });
        function settleResult() {
          if (settled) return;
          settled = true;
          const type = params.mode != null ? String(params.mode) : action.type;
          if (type === 'fail') {
            rejectFinished(new Error('fake：动作失败 ' + type));
            return;
          }
          if (type === 'selfcancel') {
            resolveFinished({ status: 'cancelled' });
            return;
          }
          if (type === 'mismatch') {
            applyModel(ctx && ctx.targetView ? ctx.targetView.model : null);
            if (store.items.length) store.items = store.items.slice(0, store.items.length - 1);
            else store.text = store.text + '!';
            render();
            resolveFinished({ status: 'completed' });
            return;
          }
          if (type === 'nop') {
            render();
            resolveFinished({ status: 'completed' });
            return;
          }
          applyModel(ctx && ctx.targetView ? ctx.targetView.model : null);
          render();
          resolveFinished({ status: 'completed' });
        }
        if (delay > 0) timer = setTimeout(settleResult, delay);
        else settleResult();
        return {
          finished: finished,
          cancel: function () {
            records.cancels += 1;
            entry.cancelled = true;
            if (settled) return;
            if (ignoreCancel) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolveFinished({ status: 'cancelled' });
          }
        };
      };
      handle.target = function (query) {
        if (handle.destroyed) return null;
        if (!isObject(query)) return null;
        if (query.part === 'text') return textEl;
        return root.parentNode ? root : null;
      };
      handle.destroy = function () {
        if (handle.destroyed) return;
        handle.destroyed = true;
        records.handleDestroys += 1;
        if (root.parentNode) root.parentNode.removeChild(root);
      };
      if (config.without) {
        config.without.forEach(function (key) { delete handle[key]; });
      }
      render();
      return handle;
    }

    const adapter = {
      name: name,
      normalizeView: normalizeView,
      validateAction: validateAction,
      mount: function (host, mountOptions) {
        if (config.mountThrows) throw new Error('fake[' + name + ']：mount 失败（测试）');
        if (!host || host.nodeType !== 1) throw new Error('fake：mount host 必须是 Element');
        records.mounts += 1;
        return makeHandle(host, mountOptions);
      },
      adopt: function (instance) {
        if (config.adoptThrows) throw new Error('fake[' + name + ']：adopt 失败（测试）');
        records.adopts += 1;
        records.adoptedInstances.push(instance);
        const el = instance && instance.el && instance.el.nodeType === 1
          ? instance.el
          : document.createElement('span');
        let destroyed = false;
        return {
          restore: function (view) {
            if (destroyed) return;
            records.restores += 1;
            instance.value = view && view.model ? String(view.model.text == null ? '' : view.model.text) : '';
            el.textContent = instance.value;
          },
          target: function () { return destroyed ? null : el; },
          destroy: function () {
            if (destroyed) return;
            destroyed = true;
            records.handleDestroys += 1;
          }
        };
      },
      records: records,
      resetRecords: function () {
        records.mounts = 0;
        records.adopts = 0;
        records.handleDestroys = 0;
        records.restores = 0;
        records.applyCues = 0;
        records.readViews = 0;
        records.performs = [];
        records.cancels = 0;
        records.instances = [];
      }
    };
    return adapter;
  };

  /* ---------------- 宿主与装配 ---------------- */

  T.slots = function (names) {
    const host = document.createElement('div');
    host.className = 'test-host';
    const map = {};
    (names || ['main']).forEach(function (name) {
      const slot = document.createElement('div');
      slot.className = 'test-slot';
      slot.setAttribute('data-slot', name);
      host.appendChild(slot);
      map[name] = slot;
    });
    document.body.appendChild(host);
    map.__host = host;
    return map;
  };

  T.removeHost = function (slotMap) {
    if (!slotMap || !slotMap.__host) return;
    const host = slotMap.__host;
    if (host.parentNode) host.parentNode.removeChild(host);
  };

  T.setup = function (config) {
    config = config || {};
    const adapters = config.adapters || {};
    const plan = Internals.definition.prepare(config.definition, {
      adapters: adapters,
      initialFrameId: config.initialFrameId
    });
    const bag = Internals.bindings.create({ plan: plan, slots: config.slots || {}, adapters: adapters });
    bag.restoreFrame(plan.frameById[plan.initialFrameId]);
    const session = Internals.controller.create({ plan: plan, bindings: bag, initialFrameId: plan.initialFrameId });
    return { plan: plan, bag: bag, session: session, slots: config.slots, adapters: adapters };
  };

  T.frame = function (id, views, caption, marks) {
    const frame = { id: id, views: views };
    if (caption !== undefined) frame.caption = caption;
    if (marks !== undefined) frame.marks = marks;
    return frame;
  };

  T.action = function (binding, type, params) {
    const action = { binding: binding, type: type };
    if (params !== undefined) action.params = params;
    return action;
  };

  T.transition = function (from, to, actions, marks) {
    const transition = { from: from, to: to, actions: actions || [] };
    if (marks !== undefined) transition.marks = marks;
    return transition;
  };

  T.readStored = function (adapter, index) {
    const entry = adapter.records.instances[index || 0];
    return entry ? entry.store : null;
  };

  window.__t = T;
};

const GROUP_DEFINITION = async () => {
  const T = window.__t;
  const D = window.NoteDemoInternals.definition;
  const results = [];
  const run = async (name, fn) => {
    try {
      await fn();
      results.push({ name: name, ok: true });
    } catch (error) {
      results.push({ name: name, ok: false, error: String((error && error.stack) || error) });
    }
  };

  const base = () => {
    const adapter = T.makeAdapter('anim');
    const definition = {
      bindings: { seq: { adapter: 'anim', slot: 'main' } },
      frames: [
        { id: 'f0', caption: '第一帧', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } } },
        { id: 'f1', caption: '第二帧', views: { seq: { items: [{ id: 'a', label: 'A' }], focus: ['a'], changed: ['a'] } }, marks: [] }
      ],
      transitions: [
        { from: 'f0', to: 'f1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'b' } }] }
      ]
    };
    return { adapter: adapter, adapters: { anim: adapter }, definition: definition };
  };

  const prepareOrThrow = (definition, adapters, options) => D.prepare(definition, {
    adapters: adapters || {},
    initialFrameId: options && options.initialFrameId !== undefined ? options.initialFrameId : null
  });

  const expectIssues = (definition, adapters, matcher, label, options) => {
    let caught = null;
    try {
      prepareOrThrow(definition, adapters, options);
    } catch (error) {
      caught = error;
    }
    T.assert(caught, (label || '定义错误') + '：应当抛出 NoteDemoDefinitionError');
    T.assert(caught.name === 'NoteDemoDefinitionError', (label || '') + '：name 应为 NoteDemoDefinitionError，实际 ' + caught.name);
    T.assert(caught instanceof Error, (label || '') + '：应当是 Error 实例');
    T.assert(Array.isArray(caught.issues), (label || '') + '：issues 应当是数组');
    T.assert(caught.issues.length > 0 && caught.issues.length <= 12, (label || '') + '：issues 应为 1..12 条，实际 ' + caught.issues.length);
    if (matcher) {
      T.assert(caught.issues.some(matcher), (label || '') + '：issues 未包含期望定位；实际：' + JSON.stringify(caught.issues));
    }
    return caught;
  };

  await run('definition.prepare 生成完整 plan 形状', () => {
    const fixture = base();
    const plan = prepareOrThrow(fixture.definition, fixture.adapters);
    T.eq(plan.planVersion, 1, 'planVersion');
    T.eq(plan.initialFrameId, 'f0', 'initialFrameId 默认首 Frame');
    T.deq(plan.bindingOrder, ['seq'], 'bindingOrder');
    T.deq(plan.frameOrder, ['f0', 'f1'], 'frameOrder');
    T.eq(plan.frames.length, 2, 'frames 长度');
    T.eq(plan.frames[0].index, 0, 'frame.index');
    T.eq(plan.frames[1].index, 1, 'frame.index 2');
    T.eq(plan.frames[0].caption, '第一帧', 'caption');
    T.eq(plan.frames[0].marks.length, 0, '缺省 marks 为空数组');
    T.eq(plan.frameById.f1.id, 'f1', 'frameById');
    const binding = plan.bindings.seq;
    T.eq(binding.id, 'seq', 'binding.id');
    T.eq(binding.adapterName, 'anim', 'binding.adapterName');
    T.eq(binding.slot, 'main', 'binding.slot');
    T.eq(binding.ownership, 'owned', '默认 ownership');
    T.eq(binding.adapter, fixture.adapter, 'binding.adapter 引用');
    T.deq(Object.keys(plan.transitions), ['f0'], 'transitions 只含相邻前进');
    T.eq(plan.transitions.f0.to, 'f1', 'transition.to');
    T.eq(plan.transitions.f0.actions.length, 1, 'transition.actions');
    T.eq(plan.transitions.f0.actions[0].type, 'remove', '动作 type');
    T.deq(plan.transitions.f0.actions[0].params, { id: 'b' }, '动作 params');
    T.eq(plan.frames[1].views.seq.cues.focus.length, 1, 'cues 保留');
    T.eq(plan.frames[0].views.seq.cues.changed.length, 0, 'cues 缺省为空');
  });

  await run('definition.prepare 支持 options.initialFrameId 覆盖', () => {
    const fixture = base();
    const plan = prepareOrThrow(fixture.definition, fixture.adapters, { initialFrameId: 'f1' });
    T.eq(plan.initialFrameId, 'f1', 'options.initialFrameId 覆盖');
    const definition2 = JSON.parse(JSON.stringify(fixture.definition));
    definition2.initialFrameId = 'f1';
    const plan2 = prepareOrThrow(definition2, fixture.adapters);
    T.eq(plan2.initialFrameId, 'f1', 'definition.initialFrameId');
    const plan3 = prepareOrThrow(definition2, fixture.adapters, { initialFrameId: 'f0' });
    T.eq(plan3.initialFrameId, 'f0', 'options 优先于 definition');
    expectIssues(definition2, fixture.adapters, (issue) => issue.indexOf('initialFrameId') >= 0,
      '不存在的 options.initialFrameId', { initialFrameId: 'ghost' });
  });

  await run('definition.prepare 聚合错误并带定位，最多 12 条', () => {
    const fixture = base();
    const bad = {
      bindings: {
        seq: { adapter: 'missing-adapter', slot: '' },
        extra: { adapter: 'anim', slot: 5 }
      },
      frames: [
        { id: 'f0', views: {} },
        { id: 'f0', caption: 3, views: { unknown: {} } }
      ],
      transitions: [{ from: 'nope', to: 'f0', actions: 'bad' }]
    };
    const error = expectIssues(bad, fixture.adapters);
    T.assert(error.issues.length >= 5, '应聚合多条问题，实际 ' + JSON.stringify(error.issues));
    T.assert(error.issues.length <= 12, 'issues 最多 12 条');
    T.assert(String(error.message).indexOf('NoteDemo 定义错误') >= 0, '错误消息应说明定义错误');
    T.assert(String(error.message).indexOf('bindings.seq.adapter') >= 0, '消息应包含定位');
  });

  await run('definition 校验定位：bindings 结构', () => {
    const fixture = base();
    const anim = { anim: fixture.adapter };
    const cases = [
      ['definition 非对象', null, {}, (i) => i.indexOf('definition') === 0],
      ['bindings 缺失', { frames: [] }, anim, (i) => i.indexOf('bindings') >= 0],
      ['bindings 为空', { bindings: {}, frames: [] }, anim, (i) => i.indexOf('bindings') >= 0],
      ['binding 配置非对象', { bindings: { seq: 5 }, frames: [] }, anim, (i) => i.indexOf('bindings.seq') >= 0],
      ['adapter 缺失', { bindings: { seq: { slot: 'main' } }, frames: [] }, anim, (i) => i.indexOf('bindings.seq.adapter') >= 0],
      ['adapter 未知', { bindings: { seq: { adapter: 'nope', slot: 'main' } }, frames: [] }, anim, (i) => i.indexOf('bindings.seq.adapter') >= 0],
      ['slot 为空', { bindings: { seq: { adapter: 'anim', slot: '' } }, frames: [] }, anim, (i) => i.indexOf('bindings.seq.slot') >= 0],
      ['options 非对象', { bindings: { seq: { adapter: 'anim', slot: 'main', options: 3 } }, frames: [] }, anim, (i) => i.indexOf('bindings.seq.options') >= 0],
      ['borrowed 无 instance', { bindings: { seq: { adapter: 'anim', slot: 'main', ownership: 'borrowed' } }, frames: [] }, anim, (i) => i.indexOf('bindings.seq.instance') >= 0],
      ['instance 配 owned', { bindings: { seq: { adapter: 'anim', slot: 'main', instance: {}, ownership: 'owned' } }, frames: [] }, anim, (i) => i.indexOf('bindings.seq.ownership') >= 0]
    ];
    cases.forEach((entry) => {
      expectIssues(entry[1], entry[2], entry[3], entry[0]);
    });
  });

  await run('definition 校验定位：frames 结构', () => {
    const fixture = base();
    const anim = { anim: fixture.adapter };
    const view = { seq: { items: [] } };
    const cases = [
      ['frames 非数组', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: {} }, (i) => i.indexOf('frames') === 0],
      ['frames 为空', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [] }, (i) => i.indexOf('frames') >= 0],
      ['frame 非对象', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [5] }, (i) => i.indexOf('frames[0]') === 0],
      ['frame id 为空', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [{ id: '', views: view }] }, (i) => i.indexOf('frames[0].id') >= 0],
      ['frame id 重复', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [{ id: 'f0', views: view }, { id: 'f0', views: view }] }, (i) => i.indexOf('frames[1].id') >= 0],
      ['caption 非字符串', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [{ id: 'f0', caption: 1, views: view }] }, (i) => i.indexOf('frames[0].caption') >= 0],
      ['views 缺失 binding', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [{ id: 'f0', views: {} }] }, (i) => i.indexOf('frames[0].views.seq') >= 0],
      ['views 含未知 binding', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [{ id: 'f0', views: { seq: { items: [] }, ghost: {} } }] }, (i) => i.indexOf('frames[0].views.ghost') >= 0],
      ['normalizeView 抛错', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [{ id: 'f0', views: { seq: { items: [{ id: '', label: 'x' }] } } }] }, (i) => i.indexOf('frames[0].views.seq') >= 0],
      ['marks 非数组', { bindings: { seq: { adapter: 'anim', slot: 'main' } }, frames: [{ id: 'f0', views: view, marks: {} }] }, (i) => i.indexOf('frames[0].marks') >= 0]
    ];
    cases.forEach((entry) => {
      expectIssues(entry[1], anim, entry[2], entry[0]);
    });
  });

  await run('definition 校验定位：transitions 与动作', () => {
    const fixture = base();
    const anim = { anim: fixture.adapter };
    const bindings = { seq: { adapter: 'anim', slot: 'main' } };
    const makeFrames = (count) => {
      const frames = [];
      for (let i = 0; i < count; i += 1) frames.push({ id: 'f' + i, views: { seq: { items: [] } } });
      return frames;
    };
    const cases = [
      ['transitions 非数组', { bindings: bindings, frames: makeFrames(2), transitions: {} }, (i) => i.indexOf('transitions') === 0],
      ['transition 非对象', { bindings: bindings, frames: makeFrames(2), transitions: [7] }, (i) => i.indexOf('transitions[0]') === 0],
      ['from 不存在', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'x', to: 'f1', actions: [] }] }, (i) => i.indexOf('transitions[0].from') >= 0],
      ['to 不存在', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'x', actions: [] }] }, (i) => i.indexOf('transitions[0].to') >= 0],
      ['to 非相邻', { bindings: bindings, frames: makeFrames(3), transitions: [{ from: 'f0', to: 'f2', actions: [] }] }, (i) => i.indexOf('transitions[0].to') >= 0],
      ['from 重复', { bindings: bindings, frames: makeFrames(3), transitions: [{ from: 'f0', to: 'f1', actions: [] }, { from: 'f0', to: 'f1', actions: [] }] }, (i) => i.indexOf('transitions[1].from') >= 0],
      ['actions 非数组', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: {} }] }, (i) => i.indexOf('transitions[0].actions') >= 0],
      ['action 非对象', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: [4] }] }, (i) => i.indexOf('transitions[0].actions[0]') === 0],
      ['action binding 未定义', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: [{ binding: 'nope', type: 'remove', params: { id: 'a' } }] }] }, (i) => i.indexOf('actions[0].binding') >= 0],
      ['action 缺少 type', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: [{ binding: 'seq', params: {} }] }] }, (i) => i.indexOf('actions[0].type') >= 0],
      ['action params 非对象', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: [{ binding: 'seq', type: 'remove', params: 3 }] }] }, (i) => i.indexOf('actions[0].params') >= 0],
      ['adapter 拒绝动作', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: [{ binding: 'seq', type: 'unsupported', params: {} }] }] }, (i) => i.indexOf('actions[0]') >= 0],
      ['parallel 嵌套', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: [{ parallel: [{ parallel: [] }] }] }] }, (i) => i.indexOf('parallel[0]') >= 0],
      ['parallel 重复 binding', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: [{ parallel: [{ binding: 'seq', type: 'remove', params: { id: 'a' } }, { binding: 'seq', type: 'swap', params: { a: 'a', b: 'b' } }] }] }] }, (i) => i.indexOf('parallel[1].binding') >= 0],
      ['parallel 为空', { bindings: bindings, frames: makeFrames(2), transitions: [{ from: 'f0', to: 'f1', actions: [{ parallel: [] }] }] }, (i) => i.indexOf('parallel') >= 0]
    ];
    cases.forEach((entry) => {
      expectIssues(entry[1], anim, entry[2], entry[0]);
    });
  });

  await run('definition 校验定位：marks', () => {
    const fixture = base();
    const anim = { anim: fixture.adapter };
    const bindings = { seq: { adapter: 'anim', slot: 'main' } };
    const frames = [
      { id: 'f0', views: { seq: { items: [] } } },
      { id: 'f1', views: { seq: { items: [] } }, marks: [] }
    ];
    const cases = [
      ['mark 非对象', [{ kind: 'focus', target: 5 }, 7], (i) => i.indexOf('frames[1].marks[1]') === 0],
      ['mark kind 非法', [{ kind: 'sparkle' }], (i) => i.indexOf('marks[0].kind') >= 0],
      ['focus target 缺失', [{ kind: 'focus' }], (i) => i.indexOf('marks[0].target') >= 0],
      ['ref binding 未知', [{ kind: 'focus', target: { binding: 'nope', query: { id: 'a' } } }], (i) => i.indexOf('marks[0].target.binding') >= 0],
      ['ref query 为空', [{ kind: 'focus', target: { binding: 'seq', query: null } }], (i) => i.indexOf('marks[0].target.query') >= 0],
      ['focus underline 缺 text', [{ kind: 'focus', mode: 'underline', target: { binding: 'seq', query: { id: 'a' } } }], (i) => i.indexOf('marks[0].text') >= 0],
      ['focus mode 非法', [{ kind: 'focus', mode: 'glow', target: { binding: 'seq', query: { id: 'a' } } }], (i) => i.indexOf('marks[0].mode') >= 0],
      ['range targets 为空', [{ kind: 'range', targets: [] }], (i) => i.indexOf('marks[0].targets') >= 0],
      ['range targets 元素非法', [{ kind: 'range', targets: [{ binding: 'seq' }] }], (i) => i.indexOf('marks[0].targets[0].query') >= 0],
      ['link from 缺失', [{ kind: 'link', to: { binding: 'seq', query: {} } }], (i) => i.indexOf('marks[0].from') >= 0],
      ['link arrow 非布尔', [{ kind: 'link', from: { binding: 'seq', query: {} }, to: { binding: 'seq', query: {} }, arrow: 'yes' }], (i) => i.indexOf('marks[0].arrow') >= 0]
    ];
    cases.forEach((entry) => {
      const definition = { bindings: bindings, frames: frames, transitions: [], marks: undefined };
      definition.frames[1].marks = entry[1];
      expectIssues(definition, anim, entry[2], entry[0]);
    });
    const valid = {
      bindings: bindings,
      frames: [{
        id: 'f0',
        views: { seq: { items: [] } },
        marks: [
          { kind: 'focus', target: { binding: 'seq', query: { id: 'a' } } },
          { kind: 'focus', mode: 'underline', text: 'A', target: { binding: 'seq', query: { id: 'a' }, optional: true } },
          { kind: 'range', targets: [{ binding: 'seq', query: { id: 'a' } }], text: '一组', side: 'top', orientation: 'horizontal' },
          { kind: 'link', from: { binding: 'seq', query: { id: 'a' } }, to: { binding: 'seq', query: { id: 'b' } }, label: '指向', arrow: true }
        ]
      }]
    };
    const plan = prepareOrThrow(valid, anim);
    T.eq(plan.frames[0].marks[0].mode, 'box', 'focus.mode 缺省 box');
    T.eq(plan.frames[0].marks[1].text, 'A', 'underline text 保留');
    T.eq(plan.frames[0].marks[1].target.optional, true, 'optional 保留');
    T.eq(plan.frames[0].marks[2].side, 'top', 'range side 保留');
    T.eq(plan.frames[0].marks[3].arrow, true, 'link arrow 保留');
    T.assert(Object.isFrozen(plan.frames[0].marks), 'marks 数组冻结');
    T.assert(Object.isFrozen(plan.frames[0].marks[0]), 'mark 对象冻结');
    T.assert(Object.isFrozen(plan.frames[0].marks[0].target), 'mark ref 冻结');
  });

  await run('definition 规范化：填默认值、深冻结、不修改输入', () => {
    const fixture = base();
    const inputView = { items: [{ id: 'a', label: 'A' }] };
    const definition = {
      bindings: { seq: { adapter: 'anim', slot: 'main' } },
      frames: [{ id: 'f0', views: { seq: inputView } }]
    };
    const plan = prepareOrThrow(definition, fixture.adapters);
    const view = plan.frames[0].views.seq;
    T.eq(view.cues.focus.length, 0, '缺省 focus 为空');
    T.eq(view.cues.changed.length, 0, '缺省 changed 为空');
    T.assert(Object.isFrozen(view), 'view 冻结');
    T.assert(Object.isFrozen(view.model), 'model 冻结');
    T.assert(Object.isFrozen(view.model.items), 'model.items 冻结');
    T.assert(Object.isFrozen(view.cues), 'cues 冻结');
    T.assert(Object.isFrozen(plan), 'plan 冻结');
    T.assert(Object.isFrozen(plan.frames), 'frames 冻结');
    T.assert(Object.isFrozen(plan.frameById.f0), 'frame 冻结');
    T.assert(!Object.isFrozen(inputView), '输入视图对象未被冻结');
    T.deq(inputView, { items: [{ id: 'a', label: 'A' }] }, '输入视图未被修改');
    let threw = false;
    try {
      'use strict';
      view.model.items.push({ id: 'x', label: 'X' });
    } catch (error) {
      threw = true;
    }
    T.assert(threw, '冻结数组不允许 push');
  });

  await run('definition 校验：并行动作与相邻过渡编译', () => {
    const adapter = T.makeAdapter('anim');
    const adapters = { anim: adapter, other: T.makeAdapter('other') };
    const frames = [
      { id: 'f0', views: { seq: { items: [] }, dom: { text: 'a' } } },
      { id: 'f1', views: { seq: { items: [{ id: 'a', label: 'A' }] }, dom: { text: 'b' } } },
      { id: 'f2', views: { seq: { items: [] }, dom: { text: 'c' } } }
    ];
    const definition = {
      bindings: {
        seq: { adapter: 'anim', slot: 'main' },
        dom: { adapter: 'other', slot: 'main', options: { label: '说明' } }
      },
      frames: frames,
      transitions: [
        { from: 'f0', to: 'f1', actions: [{ parallel: [
          { binding: 'seq', type: 'remove', params: { id: 'a' } },
          { binding: 'dom', type: 'set', params: { text: 'b' } }
        ] }], marks: [{ kind: 'focus', target: { binding: 'dom', query: { part: 'text' } } }] },
        { from: 'f1', to: 'f2', actions: [] }
      ]
    };
    const plan = prepareOrThrow(definition, adapters);
    T.eq(plan.frameOrder.length, 3, '帧数量');
    T.eq(plan.transitions.f0.actions.length, 1, 'parallel 组作为单个动作项');
    T.eq(plan.transitions.f0.actions[0].parallel.length, 2, 'parallel 成员数');
    T.eq(plan.transitions.f0.actions[0].parallel[1].binding, 'dom', 'parallel 成员 binding');
    T.eq(plan.transitions.f0.marks.length, 1, 'transition marks');
    T.deq(plan.bindings.dom.options, { label: '说明' }, 'binding.options 保留');
    T.eq(plan.transitions.f1.actions.length, 0, '空动作数组保留');
  });

  await run('compareModel：数组按序 / 对象按键 / 数值严格', () => {
    T.eq(D.compareModel({ a: [1, 2], b: { x: 'y' } }, { a: [1, 2], b: { x: 'y' } }), null, '相同结构');
    const diff = D.compareModel({ items: [{ id: 'a' }] }, { items: [{ id: 'b' }] });
    T.assert(diff, '数组对象差异应返回 diff');
    T.eq(diff.path, '$.items[0].id', 'diff.path');
    T.eq(diff.expected, 'a', 'diff.expected');
    T.eq(diff.actual, 'b', 'diff.actual');
    const order = D.compareModel({ list: [1, 2] }, { list: [2, 1] });
    T.assert(order, '数组按序比较应发现差异');
    T.eq(order.path, '$.list[0]', '顺序差异 path');
    const numberDiff = D.compareModel({ n: 1 }, { n: '1' });
    T.assert(numberDiff, '数值严格比较：1 与 "1" 不同');
    const missing = D.compareModel({ a: 1, b: 2 }, { a: 1 });
    T.assert(missing, '缺失键应报差异');
    T.eq(missing.path, '$.b', '缺失键 path');
    T.eq(missing.expected, 2, '缺失键 expected');
    T.eq(missing.actual, undefined, '缺失键 actual');
    T.eq(D.compareModel(undefined, undefined), null, 'undefined 相同');
    T.eq(D.compareModel(null, null), null, 'null 相同');
    const len = D.compareModel([1], [1, 2]);
    T.eq(len.path, '$.length', '长度差异 path');
  });

  await run('compareCues：集合比较（对象数组 / 纯量数组）', () => {
    T.eq(D.compareCues({ focus: ['b', 'a'] }, { focus: ['a', 'b'] }), null, '纯量数组按集合');
    T.eq(D.compareCues({ cells: [{ row: 'r1', col: 'c1' }, { row: 'r2', col: 'c2' }] },
      { cells: [{ row: 'r2', col: 'c2' }, { row: 'r1', col: 'c1' }] }), null, '对象数组按集合');
    const diff = D.compareCues({ focus: ['a'] }, { focus: ['b'] });
    T.assert(diff, '集合差异应返回 diff');
    T.eq(diff.path, '$.focus[0]', '集合差异 path');
    T.eq(diff.expected, 'a', '集合差异 expected');
    T.eq(diff.actual, 'b', '集合差异 actual');
    const length = D.compareCues({ focus: ['a'] }, { focus: [] });
    T.assert(length, '集合长度差异');
    T.eq(length.path, '$.focus.length', '集合长度 path');
    T.eq(D.compareCues({ caption: 'x' }, { caption: 'x' }), null, '对象标量相同');
    const missing = D.compareCues({ caption: '' }, {});
    T.assert(missing, '对象缺键应视为差异');
    T.eq(missing.path, '$.caption', '对象缺键 path');
  });

  await run('describeDiff 包含 Frame/Binding/Action/差异字段', () => {
    const text = D.describeDiff('f1', 'seq', { binding: 'seq', type: 'remove', params: { id: 'b' } },
      { path: '$.items[0].id', expected: 'a', actual: 'b' });
    T.assert(text.indexOf('Frame') >= 0, '应含 Frame');
    T.assert(text.indexOf('f1') >= 0, '应含 frameId');
    T.assert(text.indexOf('Binding') >= 0, '应含 Binding');
    T.assert(text.indexOf('seq') >= 0, '应含 bindingId');
    T.assert(text.indexOf('Action') >= 0, '应含 Action');
    T.assert(text.indexOf('remove') >= 0, '应含 action type');
    T.assert(text.indexOf('$.items[0].id') >= 0, '应含 diff.path');
    T.assert(text.indexOf('expected') >= 0 && text.indexOf('actual') >= 0, '应含 expected/actual');
  });

  return results;
};


const GROUP_BINDINGS = async () => {
  const T = window.__t;
  const D = window.NoteDemoInternals.definition;
  const B = window.NoteDemoInternals.bindings;
  const results = [];
  const run = async (name, fn) => {
    try {
      await fn();
      results.push({ name: name, ok: true });
    } catch (error) {
      results.push({ name: name, ok: false, error: String((error && error.stack) || error) });
    }
  };
  const prepare = (definition, adapters, options) => D.prepare(definition, {
    adapters: adapters,
    initialFrameId: options && options.initialFrameId !== undefined ? options.initialFrameId : null
  });

  const makeAdapters = () => ({
    anim: T.makeAdapter('anim'),
    static: T.makeAdapter('static', { without: ['perform', 'readView'] })
  });

  const makeDefinition = () => ({
    bindings: {
      seq: { adapter: 'anim', slot: 'main', options: { label: '序列' } },
      dom: { adapter: 'static', slot: 'main' }
    },
    frames: [
      { id: 'f0', caption: '一', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], focus: ['a'], changed: [] }, dom: { text: '第一帧' } } },
      { id: 'f1', caption: '二', views: { seq: { items: [{ id: 'a', label: 'A' }], focus: [], changed: ['a'] }, dom: { text: '第二帧' } } }
    ],
    transitions: [{ from: 'f0', to: 'f1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'b' } }] }]
  });

  await run('bindings.create 在 slot 内建独立子容器且不清空共享 slot', () => {
    const adapters = makeAdapters();
    const slots = T.slots(['main']);
    const marker = document.createElement('div');
    marker.className = 'host-marker';
    slots.main.appendChild(marker);
    const plan = prepare(makeDefinition(), adapters);
    const bag = B.create({ plan: plan, slots: slots, adapters: adapters });
    try {
      const containers = slots.main.querySelectorAll('.note-demo-binding');
      T.eq(containers.length, 2, '每个 binding 一个子容器');
      T.eq(containers[0].getAttribute('data-binding'), 'seq', 'data-binding 属性');
      T.eq(containers[1].getAttribute('data-binding'), 'dom', 'data-binding 属性 2');
      T.eq(slots.main.querySelector('.host-marker'), marker, '共享 slot 原有内容不被清空');
      T.deq(bag.order, ['seq', 'dom'], 'bag.order');
      const entry = bag.entry('seq');
      T.eq(entry.id, 'seq', 'entry.id');
      T.eq(entry.adapterName, 'anim', 'entry.adapterName');
      T.eq(entry.adapter, adapters.anim, 'entry.adapter');
      T.eq(entry.owned, true, 'owned 标记');
      T.eq(entry.slotName, 'main', 'entry.slotName');
      T.eq(entry.options.label, '序列', 'entry.options');
      T.eq(entry.container.parentNode, slots.main, '容器挂在 slot 上');
      T.assert(entry.container.querySelector('.fake-adapter'), '适配器挂在子容器内');
      T.eq(adapters.anim.records.mounts, 1, 'anim mount 一次');
      T.eq(adapters.static.records.mounts, 1, 'static mount 一次');
    } finally {
      bag.destroy();
      T.removeHost(slots);
    }
  });

  await run('bindings.create 挂载失败：带 binding/slot 定位并清理已建 owned 实例', () => {
    const good = T.makeAdapter('good');
    const boom = T.makeAdapter('boom', { mountThrows: true });
    const adapters = { good: good, boom: boom };
    const slots = T.slots(['main']);
    const definition = {
      bindings: { a: { adapter: 'good', slot: 'main' }, b: { adapter: 'boom', slot: 'main' } },
      frames: [{ id: 'f0', views: { a: { items: [] }, b: { items: [] } } }]
    };
    const plan = prepare(definition, adapters);
    const error = T.throws(
      () => B.create({ plan: plan, slots: slots, adapters: adapters }),
      (caught) => caught.name === 'NoteDemoBindingError',
      'mount 抛错应转成 NoteDemoBindingError'
    );
    T.assert(String(error.message).indexOf('"b"') >= 0, '错误消息含 binding id');
    T.assert(String(error.message).indexOf('main') >= 0, '错误消息含 slot 名');
    T.assert(error.binding === 'b', 'error.binding');
    T.assert(String(error.message).indexOf('mount 失败') >= 0, '错误消息含原因');
    T.assert(good.records.handleDestroys >= 1, '已创建的 owned 实例被清理');
    T.eq(slots.main.querySelectorAll('.note-demo-binding').length, 0, '失败后不残留管理容器');
    T.removeHost(slots);
  });

  await run('bindings.create 校验 BindingHandle 形状并清理', () => {
    const brokenAdapter = {
      name: 'broken',
      normalizeView: function () { return { model: {}, cues: {} }; },
      validateAction: function () {},
      mount: function (host) {
        const node = document.createElement('div');
        host.appendChild(node);
        return {};
      }
    };
    const adapters = { broken: brokenAdapter };
    const slots = T.slots(['main']);
    const plan = prepare({ bindings: { b: { adapter: 'broken', slot: 'main' } }, frames: [{ id: 'f0', views: { b: {} } }] }, adapters);
    const error = T.throws(() => B.create({ plan: plan, slots: slots, adapters: adapters }),
      (caught) => caught.name === 'NoteDemoBindingError', '无效 handle 应报错');
    T.assert(String(error.message).indexOf('BindingHandle') >= 0, '错误说明 BindingHandle');
    T.eq(slots.main.querySelectorAll('.note-demo-binding').length, 0, '无效 handle 的容器被移除');
    T.removeHost(slots);
  });

  await run('bindings.create 缺 slot / slot 非 Element 的错误定位', () => {
    const adapters = makeAdapters();
    const plan = prepare(makeDefinition(), adapters);
    const missingSlots = T.slots(['other']);
    const errorMissing = T.throws(() => B.create({ plan: plan, slots: missingSlots, adapters: adapters }),
      (caught) => caught.name === 'NoteDemoBindingError', '缺 slot 应报错');
    T.assert(String(errorMissing.message).indexOf('"seq"') >= 0, '缺 slot 错误含 binding id');
    T.assert(String(errorMissing.message).indexOf('"main"') >= 0, '缺 slot 错误含 slot 名');
    T.removeHost(missingSlots);
    const wrongSlots = { main: 'not-an-element' };
    const errorWrong = T.throws(() => B.create({ plan: plan, slots: wrongSlots, adapters: adapters }),
      (caught) => caught.name === 'NoteDemoBindingError', 'slot 非 Element 应报错');
    T.assert(String(errorWrong.message).indexOf('Element') >= 0, '错误说明 Element');
  });

  await run('bindings.create 能力检查：动作 binding 需要 perform 与 readView', () => {
    const noPerform = T.makeAdapter('np', { without: ['perform'] });
    const adapters = { np: noPerform };
    const slots = T.slots(['main']);
    const definition = {
      bindings: { seq: { adapter: 'np', slot: 'main' } },
      frames: [{ id: 'f0', views: { seq: { items: [] } } }, { id: 'f1', views: { seq: { items: [] } } }],
      transitions: [{ from: 'f0', to: 'f1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'a' } }] }]
    };
    const plan = prepare(definition, adapters);
    const error = T.throws(() => B.create({ plan: plan, slots: slots, adapters: adapters }),
      (caught) => caught.name === 'NoteDemoBindingError', '缺 perform 应报错');
    T.assert(String(error.message).indexOf('perform') >= 0, '错误说明缺 perform');
    T.assert(String(error.message).indexOf('"seq"') >= 0, '错误含 binding id');
    T.assert(noPerform.records.handleDestroys >= 1, '失败后清理已创建实例');
    T.eq(slots.main.querySelectorAll('.note-demo-binding').length, 0, '失败后清空容器');
    T.removeHost(slots);

    const noRead = T.makeAdapter('nr', { without: ['readView'] });
    const adapters2 = { nr: noRead };
    const slots2 = T.slots(['main']);
    const definition2 = {
      bindings: { seq: { adapter: 'nr', slot: 'main' } },
      frames: [{ id: 'f0', views: { seq: { items: [] } } }, { id: 'f1', views: { seq: { items: [] } } }],
      transitions: [{ from: 'f0', to: 'f1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'a' } }] }]
    };
    const plan2 = prepare(definition2, adapters2);
    const error2 = T.throws(() => B.create({ plan: plan2, slots: slots2, adapters: adapters2 }),
      (caught) => caught.name === 'NoteDemoBindingError', '缺 readView 应报错');
    T.assert(String(error2.message).indexOf('readView') >= 0, '错误说明缺 readView');
    T.eq(slots2.main.querySelectorAll('.note-demo-binding').length, 0, '失败后清空容器');
    T.removeHost(slots2);
  });

  await run('bindings.create 能力检查：标记 binding 需要 target', () => {
    const noTarget = T.makeAdapter('nt', { without: ['target'] });
    const adapters = { nt: noTarget };
    const slots = T.slots(['main']);
    const definition = {
      bindings: { dom: { adapter: 'nt', slot: 'main' } },
      frames: [{
        id: 'f0',
        views: { dom: { text: 'x' } },
        marks: [{ kind: 'focus', target: { binding: 'dom', query: { part: 'text' } } }]
      }]
    };
    const plan = prepare(definition, adapters);
    const error = T.throws(() => B.create({ plan: plan, slots: slots, adapters: adapters }),
      (caught) => caught.name === 'NoteDemoBindingError', '缺 target 应报错');
    T.assert(String(error.message).indexOf('target') >= 0, '错误说明缺 target');
    T.assert(String(error.message).indexOf('"dom"') >= 0, '错误含 binding id');
    T.eq(slots.main.querySelectorAll('.note-demo-binding').length, 0, '失败后清空容器');
    T.removeHost(slots);
  });

  await run('bindings 恢复 / 读回 / 提示 / 目标 / 销毁', () => {
    const adapters = makeAdapters();
    const slots = T.slots(['main']);
    const plan = prepare(makeDefinition(), adapters);
    const bag = B.create({ plan: plan, slots: slots, adapters: adapters });
    bag.restoreFrame(plan.frameById.f0);
    T.eq(adapters.anim.records.restores, 1, 'restoreFrame 调用组件 restore');
    T.eq(adapters.static.records.restores, 1, '静态 binding 也被恢复');
    T.deq(bag.readView('seq').model.items.map(function (item) { return item.id; }), ['a', 'b'], 'readView 读回真实状态');
    bag.applyCues('seq', { focus: ['b'], changed: ['a'] });
    T.deq(bag.readView('seq').cues.focus, ['b'], 'applyCues 生效');
    T.deq(bag.readView('seq').cues.changed, ['a'], 'applyCues changed 生效');
    const target = bag.target({ binding: 'seq', query: { part: 'text' } });
    T.assert(target && target.nodeType === 1, 'target 返回 Element');
    T.eq(bag.target({ binding: 'missing', query: {} }), null, '未知 binding target 为 null');
    T.eq(bag.target(null), null, '无效 ref target 为 null');
    T.eq(bag.entry('missing'), null, '未知 entry 为 null');
    bag.restoreBindings(['seq'], plan.frameById.f1);
    T.deq(bag.readView('seq').model.items.map(function (item) { return item.id; }), ['a'], 'restoreBindings 只恢复指定子集');
    T.eq(bag.applyCues('dom', {}), undefined, '无 applyCues 时静默无操作');
    T.eq(bag.readView('dom'), null, '无 readView 时返回 null');
    bag.destroy();
    T.eq(slots.main.querySelectorAll('.note-demo-binding').length, 0, '销毁移除管理容器');
    T.assert(adapters.anim.records.handleDestroys >= 1, '销毁调用 handle.destroy');
    const destroysAfterFirst = adapters.anim.records.handleDestroys;
    bag.destroy();
    T.eq(adapters.anim.records.handleDestroys, destroysAfterFirst, '重复 destroy 幂等');
    T.removeHost(slots);
  });

  await run('bindings borrowed：不销毁外部实例', () => {
    const anim = T.makeAdapter('anim');
    const adapters = { anim: anim };
    const borrowedInstance = { destroyed: false, value: '', el: document.createElement('div') };
    document.body.appendChild(borrowedInstance.el);
    const slots = T.slots(['main']);
    const definition = {
      bindings: { seq: { adapter: 'anim', slot: 'main', instance: borrowedInstance } },
      frames: [{ id: 'f0', views: { seq: { items: [], text: '借用视图' } } }]
    };
    const plan = prepare(definition, adapters);
    T.eq(plan.bindings.seq.ownership, 'borrowed', 'ownership 默认 borrowed');
    const bag = B.create({ plan: plan, slots: slots, adapters: adapters });
    try {
      T.eq(anim.records.adopts, 1, '调用 adopt');
      T.eq(anim.records.mounts, 0, 'borrowed 不调用 mount');
      T.eq(bag.entries.seq.owned, false, 'borrowed owned=false');
      bag.restoreFrame(plan.frameById.f0);
      T.eq(borrowedInstance.value, '借用视图', '借用实例被写入受控视图');
    } finally {
      bag.destroy();
      T.assert(anim.records.handleDestroys >= 1, 'borrowed handle.destroy 被调用');
      T.assert(borrowedInstance.destroyed === false, '外部实例未被销毁');
      T.eq(slots.main.querySelectorAll('.note-demo-binding').length, 0, '管理容器被移除');
      if (borrowedInstance.el.parentNode) borrowedInstance.el.parentNode.removeChild(borrowedInstance.el);
      T.removeHost(slots);
    }
  });

  return results;
};


const GROUP_RUNNER = async () => {
  const T = window.__t;
  const D = window.NoteDemoInternals.definition;
  const R = window.NoteDemoInternals.runner;
  const results = [];
  const run = async (name, fn) => {
    try {
      await fn();
      results.push({ name: name, ok: true });
    } catch (error) {
      results.push({ name: name, ok: false, error: String((error && error.stack) || error) });
    }
  };
  const prepare = (definition, adapters) => D.prepare(definition, { adapters: adapters, initialFrameId: null });
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  const makePlan = () => {
    const anim = T.makeAdapter('anim');
    const adapters = { anim: anim };
    const definition = {
      bindings: {
        seq: { adapter: 'anim', slot: 'main' },
        dom: { adapter: 'anim', slot: 'main' }
      },
      frames: [
        { id: 'f0', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, dom: { text: 'a' } } },
        { id: 'f1', views: { seq: { items: [{ id: 'a', label: 'A' }], focus: ['a'] }, dom: { text: 'b' } } },
        { id: 'f2', views: { seq: { items: [] }, dom: { text: 'c' } } }
      ],
      transitions: [
        { from: 'f0', to: 'f1', actions: [
          { binding: 'seq', type: 'remove', params: { id: 'b' } },
          { binding: 'dom', type: 'set', params: { text: 'b' } }
        ] },
        { from: 'f1', to: 'f2', actions: [{ parallel: [
          { binding: 'seq', type: 'remove', params: { id: 'a' } },
          { binding: 'dom', type: 'set', params: { text: 'c' } }
        ] }] }
      ]
    };
    return prepare(definition, adapters);
  };

  const makeBag = (config) => {
    config = config || {};
    const log = [];
    const handles = {};
    const order = config.order || ['seq', 'dom'];
    order.forEach(function (id) {
      const state = { model: null, cues: null };
      const handle = {
        id: id,
        restoreCalls: [],
        applyCueCalls: [],
        readViewCalls: 0,
        destroyed: false,
        restore: function (view) {
          handle.restoreCalls.push(view);
          state.model = clone(view.model);
          state.cues = clone(view.cues);
        },
        readView: function () {
          handle.readViewCalls += 1;
          return { model: clone(state.model), cues: clone(state.cues) };
        },
        applyCues: function (cues) {
          handle.applyCueCalls.push(clone(cues));
          if (config.ignoreCuesFor === id) return;
          state.cues = clone(cues);
        },
        destroy: function () { handle.destroyed = true; },
        target: function () { return null; }
      };
      if (config.brokenPerform && config.brokenPerform.indexOf(id) >= 0) {
        handle.perform = function () { return { finished: Promise.resolve({ status: 'completed' }) }; };
      } else if (config.missingPerform && config.missingPerform.indexOf(id) >= 0) {
        delete handle.perform;
      } else if (config.throwPerform && config.throwPerform.indexOf(id) >= 0) {
        handle.perform = function () { throw new Error('perform 抛错'); };
      } else {
        handle.perform = function (action, ctx) {
          const entry = {
            id: id,
            action: action,
            ctx: ctx,
            cancelled: false,
            cancelSettled: false,
            startedAt: Date.now()
          };
          log.push(entry);
          const params = Object.assign({}, action.params || {});
          let delay = params.delay == null ? 0 : Number(params.delay);
          let cancelDelay = params.cancelDelay == null ? 0 : Number(params.cancelDelay);
          if (ctx && ctx.motion === 'reduced') delay = 0;
          let settled = false;
          let timer = 0;
          let resolveFn = null;
          let rejectFn = null;
          const finished = new Promise(function (resolve, reject) {
            resolveFn = resolve;
            rejectFn = reject;
          });
          function settle() {
            if (settled) return;
            settled = true;
            const mode = params.mode;
            if (mode === 'fail') {
              rejectFn(new Error('动作失败（测试）'));
              return;
            }
            if (mode === 'reject') {
              rejectFn(new Error('动作拒绝（测试）'));
              return;
            }
            if (mode === 'selfcancel') {
              resolveFn({ status: 'cancelled' });
              return;
            }
            if (mode !== 'mismatch' && ctx && ctx.targetView) {
              state.model = clone(ctx.targetView.model);
            }
            resolveFn({ status: 'completed' });
          }
          if (delay > 0) timer = setTimeout(settle, delay);
          else settle();
          return {
            finished: finished,
            cancel: function () {
              entry.cancelled = true;
              if (settled) return;
              settled = true;
              if (timer) clearTimeout(timer);
              function finishCancel() {
                entry.cancelSettled = true;
                resolveFn({ status: 'cancelled' });
              }
              if (cancelDelay > 0) setTimeout(finishCancel, cancelDelay);
              else finishCancel();
            }
          };
        };
      }
      handles[id] = handle;
    });
    const bag = {
      order: order.slice(),
      entries: {},
      restoreFrame: function (frame) {
        order.forEach(function (id) {
          if (frame && frame.views && frame.views[id]) handles[id].restore(frame.views[id]);
        });
      },
      restoreBindings: function (ids, frame) {
        ids.forEach(function (id) {
          if (frame && frame.views && frame.views[id]) handles[id].restore(frame.views[id]);
        });
      },
      applyCues: function (id, cues) { handles[id].applyCues(cues); },
      readView: function (id) { return handles[id].readView(); },
      target: function () { return null; },
      entry: function (id) { return handles[id] ? { id: id, handle: handles[id] } : null; },
      destroy: function () {}
    };
    order.forEach(function (id) {
      bag.entries[id] = { id: id, handle: handles[id] };
    });
    bag.log = log;
    bag.handles = handles;
    return bag;
  };

  const runTransition = (plan, transition, bag, motion) => R.run({
    plan: plan,
    transition: transition,
    bindings: bag,
    motion: motion || 'normal'
  });

  await run('runner 串行执行动作：顺序、model 核对、applyCues 各一次', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const outcome = await runTransition(plan, plan.transitions.f0, bag);
    T.deq(outcome, { status: 'completed' }, 'runner 完成结果');
    T.eq(bag.log.length, 2, '执行两个动作');
    T.deq(bag.log.map(function (entry) { return entry.id; }), ['seq', 'dom'], '按 actions 顺序串行');
    T.eq(bag.handles.seq.readViewCalls, 2, 'seq readView：model 核对一次 + cues 读回一次');
    T.eq(bag.handles.dom.readViewCalls, 2, 'dom readView：model 核对一次 + cues 读回一次');
    T.deq(bag.handles.seq.applyCueCalls, [{ focus: ['a'], changed: [] }], 'seq 应用目标 cues');
    T.deq(bag.handles.dom.applyCueCalls, [{ focus: [], changed: [] }], 'dom 应用目标 cues');
    T.eq(bag.handles.seq.restoreCalls.length, 0, 'runner 不调用 restore 掩盖');
  });

  await run('runner 并行组：同组一起 perform，全部完成后继续', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const outcome = await runTransition(plan, plan.transitions.f1, bag);
    T.deq(outcome, { status: 'completed' }, '并行完成');
    T.eq(bag.log.length, 2, '两个成员都执行');
    T.deq(bag.log.map(function (entry) { return entry.id; }), ['seq', 'dom'], 'parallel 成员按顺序启动');
    T.assert(bag.log.every(function (entry) { return entry.cancelled === false; }), '并行成员均未取消');
    T.eq(bag.handles.seq.readViewCalls, 2, '并行核对 readView');
    T.eq(bag.handles.dom.readViewCalls, 2, '并行核对 readView 2');
  });

  await run('runner 并行组失败：取消同组其余并抛出带定位错误', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const transition = {
      from: 'f1',
      to: 'f2',
      actions: [{ parallel: [
        { binding: 'seq', type: 'remove', params: { id: 'a', mode: 'fail' } },
        { binding: 'dom', type: 'set', params: { text: 'c', delay: 200 } }
      ] }]
    };
    const error = await runTransition(plan, transition, bag).then(
      function () { throw new Error('并行失败应拒绝'); },
      function (caught) { return caught; }
    );
    T.assert(error instanceof Error, '抛出 Error');
    T.eq(error.details.binding, 'seq', 'details.binding');
    T.eq(error.details.frameId, 'f2', 'details.frameId');
    T.eq(error.details.action.params.mode, 'fail', 'details.action');
    T.assert(bag.handles.dom.readViewCalls === 0, '失败后不进入核对');
    T.assert(bag.log.some(function (entry) { return entry.id === 'dom' && entry.cancelled; }), '同组其余动作被取消');
  });

  await run('runner 动作异常：取消其余句柄并抛出', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const transition = {
      from: 'f0',
      to: 'f1',
      actions: [
        { binding: 'seq', type: 'remove', params: { id: 'b', mode: 'reject', delay: 0 } },
        { binding: 'dom', type: 'set', params: { text: 'b' } }
      ]
    };
    const error = await runTransition(plan, transition, bag).then(
      function () { throw new Error('动作异常应拒绝'); },
      function (caught) { return caught; }
    );
    T.eq(error.details.binding, 'seq', '异常定位 binding');
    T.eq(bag.log.length, 1, '失败后不再启动后续动作');
  });

  await run('runner model 不符：抛错带 details，不调用 restore/applyCues', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const transition = {
      from: 'f0',
      to: 'f1',
      actions: [{ binding: 'seq', type: 'remove', params: { id: 'b', mode: 'mismatch' } }]
    };
    const error = await runTransition(plan, transition, bag).then(
      function () { throw new Error('model 不符应抛错'); },
      function (caught) { return caught; }
    );
    T.assert(error.details, '存在 details');
    T.eq(error.details.frameId, 'f1', 'details.frameId');
    T.eq(error.details.binding, 'seq', 'details.binding');
    T.eq(error.details.action.type, 'remove', 'details.action');
    T.assert(error.details.path !== undefined, 'details.path 存在');
    T.assert('expected' in error.details, 'details.expected 存在');
    T.assert('actual' in error.details, 'details.actual 存在');
    T.assert(String(error.message).indexOf('Frame') >= 0, '消息含 Frame');
    T.assert(String(error.message).indexOf('Binding') >= 0, '消息含 Binding');
    T.assert(String(error.message).indexOf('Action') >= 0, '消息含 Action');
    T.assert(String(error.message).indexOf('path') >= 0, '消息含差异 path');
    T.eq(bag.handles.seq.restoreCalls.length, 0, 'runner 不调用 restore');
    T.eq(bag.handles.seq.applyCueCalls.length, 0, 'model 不符时不应 applyCues');
  });

  await run('runner cues 读回不符：抛错带 details', async () => {
    const plan = makePlan();
    const bag = makeBag({ ignoreCuesFor: 'seq' });
    const transition = {
      from: 'f0',
      to: 'f1',
      actions: [{ binding: 'seq', type: 'remove', params: { id: 'b' } }]
    };
    const error = await runTransition(plan, transition, bag).then(
      function () { throw new Error('cues 不符应抛错'); },
      function (caught) { return caught; }
    );
    T.eq(error.details.binding, 'seq', 'cues 错误定位 binding');
    T.eq(error.details.frameId, 'f1', 'cues 错误 frameId');
    T.assert(String(error.message).indexOf('cues') >= 0, '消息说明 cues');
    T.eq(bag.handles.seq.applyCueCalls.length, 1, '已尝试 applyCues 一次');
  });

  await run('runner abort：取消已启动句柄，等待结算后返回 cancelled 且不应用 cues', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const controller = new AbortController();
    const transition = {
      from: 'f0',
      to: 'f1',
      actions: [{ binding: 'seq', type: 'remove', params: { id: 'b', delay: 300, cancelDelay: 20 } }]
    };
    const promise = R.run({
      plan: plan,
      transition: transition,
      bindings: bag,
      signal: controller.signal,
      motion: 'normal'
    });
    await T.wait(10);
    controller.abort();
    const outcome = await promise;
    T.deq(outcome, { status: 'cancelled' }, 'abort 返回 cancelled');
    T.eq(bag.log.length, 1, '只启动一个动作');
    T.eq(bag.log[0].cancelled, true, '调用 handle.cancel');
    T.eq(bag.log[0].cancelSettled, true, '返回前 finished 已结算');
    T.eq(bag.handles.seq.applyCueCalls.length, 0, '取消后不得应用 cues');
    T.eq(bag.handles.seq.readViewCalls, 0, '取消后不得读回核对');
  });

  await run('runner 已 aborted 的 signal 直接 cancelled', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const controller = new AbortController();
    controller.abort();
    const outcome = await R.run({ plan: plan, transition: plan.transitions.f0, bindings: bag, signal: controller.signal });
    T.deq(outcome, { status: 'cancelled' }, '预取消直接返回 cancelled');
    T.eq(bag.log.length, 0, '不启动动作');
  });

  await run('runner perform 形状错误视为定义错误', async () => {
    const plan = makePlan();
    const bag = makeBag({ brokenPerform: ['seq'] });
    const error = await runTransition(plan, plan.transitions.f0, bag).then(
      function () { throw new Error('perform 形状错误应抛错'); },
      function (caught) { return caught; }
    );
    T.assert(String(error.message).indexOf('perform') >= 0, '错误说明 perform 返回值');
    T.assert(error.details && error.details.binding === 'seq', '错误定位 binding');
  });

  await run('runner perform 抛异常：带定位并被捕获', async () => {
    const plan = makePlan();
    const bag = makeBag({ throwPerform: ['seq'] });
    const error = await runTransition(plan, plan.transitions.f0, bag).then(
      function () { throw new Error('perform 抛异常应拒绝'); },
      function (caught) { return caught; }
    );
    T.assert(String(error.message).indexOf('perform 抛错') >= 0, '保留原始错误消息');
    T.eq(error.details.binding, 'seq', '错误定位 binding');
  });

  await run('runner 传递 motion 与 sourceView/targetView', async () => {
    const plan = makePlan();
    const bagNormal = makeBag();
    await runTransition(plan, plan.transitions.f0, bagNormal, 'normal');
    T.eq(bagNormal.log[0].ctx.motion, 'normal', 'normal 动效');
    T.eq(bagNormal.log[0].ctx.sourceView, plan.frames[0].views.seq, 'sourceView 来自来源 Frame');
    T.eq(bagNormal.log[0].ctx.targetView, plan.frames[1].views.seq, 'targetView 来自目标 Frame');
    const bagReduced = makeBag();
    await runTransition(plan, plan.transitions.f0, bagReduced, 'reduced');
    T.eq(bagReduced.log[0].ctx.motion, 'reduced', 'reduced 动效');
    T.eq(bagReduced.log[1].ctx.motion, 'reduced', '每个动作都收到 reduced');
  });

  await run('runner 无动作过渡直接 completed', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const outcome = await runTransition(plan, { from: 'f0', to: 'f1', actions: [] }, bag);
    T.deq(outcome, { status: 'completed' }, '无动作 completed');
    T.eq(bag.log.length, 0, '不执行动作');
  });

  await run('runner 动作自报 cancelled 时停止后续动作', async () => {
    const plan = makePlan();
    const bag = makeBag();
    const transition = {
      from: 'f0',
      to: 'f1',
      actions: [
        { binding: 'seq', type: 'remove', params: { id: 'b', mode: 'selfcancel' } },
        { binding: 'dom', type: 'set', params: { text: 'b' } }
      ]
    };
    const outcome = await runTransition(plan, transition, bag);
    T.deq(outcome, { status: 'cancelled' }, '自报 cancelled');
    T.eq(bag.log.length, 1, '后续动作未启动');
  });

  return results;
};

const GROUP_CONTROLLER = async () => {
  const T = window.__t;
  const D = window.NoteDemoInternals.definition;
  const B = window.NoteDemoInternals.bindings;
  const C = window.NoteDemoInternals.controller;
  const results = [];
  const run = async (name, fn) => {
    try {
      await fn();
      results.push({ name: name, ok: true });
    } catch (error) {
      results.push({ name: name, ok: false, error: String((error && error.stack) || error) });
    }
  };

  const makeAdapters = (config) => {
    config = config || {};
    return {
      anim: T.makeAdapter('anim', config.anim || {}),
      static: T.makeAdapter('static', Object.assign(
        { without: ['perform', 'readView', 'applyCues'] },
        config.static || {}
      ))
    };
  };

  const definition3 = (params) => {
    params = params || {};
    return {
      bindings: {
        seq: { adapter: 'anim', slot: 'main' },
        dom: { adapter: 'static', slot: 'main' }
      },
      frames: [
        { id: 'f0', caption: '第零帧', views: {
          seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], focus: [], changed: [] },
          dom: { text: '零' }
        } },
        { id: 'f1', caption: '第一帧', views: {
          seq: { items: [{ id: 'a', label: 'A' }], focus: ['a'], changed: ['a'] },
          dom: { text: '一' }
        } },
        { id: 'f2', caption: '第二帧', views: {
          seq: { items: [], focus: [], changed: [] },
          dom: { text: '二' }
        } }
      ],
      transitions: [
        { from: 'f0', to: 'f1', actions: [{ binding: 'seq', type: 'remove', params: Object.assign({ id: 'b' }, params.f0 || {}) }] },
        { from: 'f1', to: 'f2', actions: [{ binding: 'seq', type: 'remove', params: Object.assign({ id: 'a' }, params.f1 || {}) }] }
      ]
    };
  };

  const setup = (definition, config, adaptersOverride) => {
    config = config || {};
    const adapters = adaptersOverride || makeAdapters(config);
    const slots = config.slots || T.slots(['main']);
    const plan = D.prepare(definition, { adapters: adapters, initialFrameId: config.initialFrameId });
    const bag = B.create({ plan: plan, slots: slots, adapters: adapters });
    bag.restoreFrame(plan.frameById[plan.initialFrameId]);
    const session = C.create({ plan: plan, bindings: bag, initialFrameId: plan.initialFrameId });
    return {
      adapters: adapters,
      slots: slots,
      plan: plan,
      bag: bag,
      session: session,
      dispose: function () {
        try { session.destroy(); } catch (error) { /* already */ }
        T.removeHost(slots);
      }
    };
  };

  const idsOf = (handle) => {
    const record = handle.adapters.anim.records.instances[0];
    return record ? record.store.items.map(function (item) { return item.id; }) : null;
  };
  const staticTextOf = (handle) => {
    const record = handle.adapters.static.records.instances[0];
    return record ? record.store.text : null;
  };
  const capture = (session) => {
    const log = [];
    const unsubscribe = session.subscribe(function (next) { log.push(next); });
    return {
      log: log,
      unsubscribe: unsubscribe,
      last: function () { return log[log.length - 1]; }
    };
  };

  await run('controller 初始状态：idle / settled / 冻结 / 内部引用', () => {
    const h = setup(definition3());
    try {
      const state = h.session.getState();
      T.deq(state, { phase: 'idle', settledFrameId: 'f0', targetFrameId: null, replaying: false, error: null }, '初始状态');
      T.assert(Object.isFrozen(state), '状态对象冻结');
      T.eq(typeof h.session.next, 'function', 'next 暴露');
      T.eq(typeof h.session.__reportError, 'function', '__reportError 暴露');
      T.eq(h.session.__plan, h.plan, '__plan 引用 plan');
      T.eq(h.session.__bindings, h.bag, '__bindings 引用 bag');
      T.eq(staticTextOf(h), '零', '初始 Frame 恢复静态 binding');
      T.deq(idsOf(h), ['a', 'b'], '初始 Frame 恢复动态 binding');
    } finally {
      h.dispose();
    }
  });

  await run('controller.subscribe 立即回调、状态副本冻结、可取消订阅', async () => {
    const h = setup(definition3());
    try {
      const captured = capture(h.session);
      T.eq(captured.log.length, 1, '订阅后立即回调一次');
      T.eq(captured.log[0], h.session.getState(), '立即回调当前状态');
      T.assert(Object.isFrozen(captured.log[0]), '回调状态冻结');
      await h.session.go('f2');
      T.assert(captured.log.length >= 2, '导航发布新状态');
      T.assert(captured.log[captured.log.length - 1] !== captured.log[0], '每次发布新对象');
      T.assert(Object.isFrozen(captured.last()), '新发布状态冻结');
      const before = captured.log.length;
      captured.unsubscribe();
      await h.session.go('f0');
      T.eq(captured.log.length, before, '取消订阅后不再回调');
      const throwing = h.session.subscribe(function () { throw new Error('listener boom'); });
      T.eq(typeof throwing, 'function', '抛错 listener 不影响订阅返回');
      await h.session.go('f1');
      throwing();
    } finally {
      h.dispose();
    }
  });

  await run('controller.next：running 状态、动作完成、静态与 cues 落地', async () => {
    const h = setup(definition3());
    try {
      const captured = capture(h.session);
      const promise = h.session.next();
      const during = h.session.getState();
      T.eq(during.phase, 'running', 'next 立即进入 running');
      T.eq(during.targetFrameId, 'f1', 'targetFrameId');
      T.eq(during.settledFrameId, 'f0', 'running 时 settled 仍是来源 Frame');
      T.eq(during.replaying, false, 'replaying false');
      const result = await promise;
      T.deq(result, { status: 'completed', frameId: 'f1' }, 'next 结果');
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f1', targetFrameId: null, replaying: false, error: null }, '完成后状态');
      T.deq(idsOf(h), ['a'], '动态组件到达目标 model');
      T.deq(h.adapters.anim.records.instances[0].store.changed, ['a'], '目标 cues 生效');
      T.eq(staticTextOf(h), '一', '静态组件恢复目标视图');
      T.assert(captured.log.some(function (state) { return state.phase === 'running'; }), '发布 running');
      T.eq(captured.last().phase, 'idle', '最后发布 idle');
    } finally {
      h.dispose();
    }
  });

  await run('controller 直接恢复（无动作/无过渡）不发布 running', async () => {
    const h = setup(definition3());
    try {
      const captured = capture(h.session);
      const result = await h.session.go('f1');
      T.deq(result, { status: 'completed', frameId: 'f1' }, 'go 直接恢复');
      T.assert(!captured.log.some(function (state) { return state.phase === 'running'; }), '不发布 running');
      T.deq(idsOf(h), ['a'], '目标 model 已恢复');
      T.eq(staticTextOf(h), '一', '静态视图已恢复');
      T.eq(h.adapters.anim.records.performs.length, 0, '不播放动作');
      const direct = await h.session.prev();
      T.deq(direct, { status: 'completed', frameId: 'f0' }, 'prev 直接恢复上一 Frame');
      T.deq(idsOf(h), ['a', 'b'], 'prev 恢复来源 model');
    } finally {
      h.dispose();
    }
  });

  await run('controller noop：start / end / unknown-frame + error 状态可再导航', async () => {
    const h = setup(definition3());
    try {
      T.deq(await h.session.prev(), { status: 'noop', reason: 'start', frameId: 'f0' }, '首 Frame prev noop');
      await h.session.go('f2');
      T.deq(await h.session.next(), { status: 'noop', reason: 'end', frameId: 'f2' }, '末 Frame next noop');
      const failed = await h.session.go('ghost');
      T.eq(failed.status, 'failed', 'unknown go failed');
      T.eq(failed.reason, 'unknown-frame', 'reason unknown-frame');
      T.eq(failed.frameId, 'f2', 'failed frameId 保持 settled');
      T.assert(failed.error && String(failed.error.message).indexOf('ghost') >= 0, 'failed 带定位 error');
      T.eq(h.session.getState().phase, 'error', '发布 error 状态');
      T.eq(h.session.getState().settledFrameId, 'f2', 'error 不改变 settledFrameId');
      T.deq(await h.session.go('f0'), { status: 'completed', frameId: 'f0' }, 'error 后 go 成功');
      T.eq(h.session.getState().phase, 'idle', '成功清除 error 状态');
      T.eq(h.session.getState().error, null, 'error 字段清空');
      const failed2 = await h.session.go('ghost');
      T.eq(failed2.status, 'failed', '再次 unknown 仍 failed');
      T.deq(await h.session.next(), { status: 'completed', frameId: 'f1' }, 'error 后 next 仍可执行动作');
      T.eq(h.session.getState().phase, 'idle', '动作成功后回到 idle');
    } finally {
      h.dispose();
    }
  });

  await run('controller running 时 next 返回 busy noop（不排队）', async () => {
    const h = setup(definition3({ f0: { delay: 120 } }));
    try {
      const promise = h.session.next();
      T.eq(h.session.getState().phase, 'running', '运行中');
      const busy = await h.session.next();
      T.deq(busy, { status: 'noop', reason: 'busy', frameId: 'f0' }, 'running 时 next 不排队');
      T.deq(await promise, { status: 'completed', frameId: 'f1' }, '原运行正常完成');
      T.eq(h.session.getState().settledFrameId, 'f1', '原运行提交目标');
    } finally {
      h.dispose();
    }
  });

  await run('controller running 时 prev：取消旧运行并回到 source', async () => {
    const h = setup(definition3({ f0: { delay: 150 } }));
    try {
      const nextPromise = h.session.next();
      await T.wait(10);
      T.eq(h.session.getState().phase, 'running', '先进入 running');
      const prevResult = await h.session.prev();
      T.deq(prevResult, { status: 'completed', frameId: 'f0' }, 'prev 取消后 completed/source');
      T.deq(await nextPromise, { status: 'cancelled', frameId: 'f0' }, '旧运行 Promise cancelled/source');
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f0', targetFrameId: null, replaying: false, error: null }, '取消后 idle/source');
      T.deq(idsOf(h), ['a', 'b'], '取消后恢复来源画面');
      T.eq(staticTextOf(h), '零', '取消后静态恢复来源视图');
      T.assert(h.adapters.anim.records.cancels >= 1, '取消了进行中的动作');
    } finally {
      h.dispose();
    }
  });

  await run('controller running 时 go：取消旧运行后直接恢复目标', async () => {
    const h = setup(definition3({ f0: { delay: 150 } }));
    try {
      const nextPromise = h.session.next();
      await T.wait(10);
      const goResult = await h.session.go('f2');
      T.deq(goResult, { status: 'completed', frameId: 'f2' }, 'go 取消后 completed/target');
      T.deq(await nextPromise, { status: 'cancelled', frameId: 'f0' }, '旧运行 cancelled/source');
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f2', targetFrameId: null, replaying: false, error: null }, 'go 后状态');
      T.deq(idsOf(h), [], 'go 直接恢复目标 model（不播中间步骤）');
      T.eq(staticTextOf(h), '二', 'go 静态视图目标');
    } finally {
      h.dispose();
    }
  });

  await run('controller replay（idle）：从入边来源恢复后重演，replaying=true', async () => {
    const h = setup(definition3());
    try {
      await h.session.next();
      T.eq(h.adapters.anim.records.performs.length, 1, '首次 next 播放一次动作');
      const captured = capture(h.session);
      const result = await h.session.replay();
      T.deq(result, { status: 'completed', frameId: 'f1' }, 'replay 结果');
      T.eq(h.adapters.anim.records.performs.length, 2, 'replay 重演动作');
      const replayPerform = h.adapters.anim.records.performs[1];
      T.eq(replayPerform.ctx.sourceView, h.plan.frames[0].views.seq, 'replay ctx.sourceView 取入边来源 Frame');
      T.eq(replayPerform.ctx.targetView, h.plan.frames[1].views.seq, 'replay ctx.targetView 取目标 Frame');
      const runningStates = captured.log.filter(function (state) { return state.phase === 'running'; });
      T.assert(runningStates.length >= 1, 'replay 发布 running');
      T.eq(runningStates[0].replaying, true, 'running 时 replaying=true');
      T.eq(runningStates[0].settledFrameId, 'f0', 'replay running 时 settled 为入边来源（供过渡标记使用）');
      T.eq(runningStates[0].targetFrameId, 'f1', 'replay running 时 target 为当前 Frame');
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f1', targetFrameId: null, replaying: false, error: null }, 'replay 完成后回到目标');
    } finally {
      h.dispose();
    }
  });

  await run('controller replay：首 Frame noop start', async () => {
    const h = setup(definition3());
    try {
      T.deq(await h.session.replay(), { status: 'noop', reason: 'start', frameId: 'f0' }, '首 Frame replay noop');
    } finally {
      h.dispose();
    }
  });

  await run('controller replay：无 transition / 无动作时直接恢复当前 Frame', async () => {
    const noTransition = {
      bindings: { seq: { adapter: 'anim', slot: 'main' } },
      frames: [
        { id: 'f0', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } } },
        { id: 'f1', views: { seq: { items: [{ id: 'a', label: 'A' }] } } },
        { id: 'f2', views: { seq: { items: [] } } }
      ],
      transitions: []
    };
    const h = setup(noTransition);
    try {
      await h.session.go('f2');
      const result = await h.session.replay();
      T.deq(result, { status: 'completed', frameId: 'f2' }, '无 transition 时 replay 直接恢复当前 Frame');
      T.deq(idsOf(h), [], '恢复当前 Frame 视图');
      T.eq(h.adapters.anim.records.performs.length, 0, '不播放动作');
    } finally {
      h.dispose();
    }
    const emptyActions = {
      bindings: { seq: { adapter: 'anim', slot: 'main' } },
      frames: [
        { id: 'f0', views: { seq: { items: [{ id: 'a', label: 'A' }] } } },
        { id: 'f1', views: { seq: { items: [] } } }
      ],
      transitions: [{ from: 'f0', to: 'f1', actions: [] }]
    };
    const h2 = setup(emptyActions);
    try {
      await h2.session.next();
      const replay = await h2.session.replay();
      T.deq(replay, { status: 'completed', frameId: 'f1' }, '无动作过渡 replay 直接恢复');
      T.eq(h2.adapters.anim.records.performs.length, 0, '无动作 replay 不播放');
    } finally {
      h2.dispose();
    }
  });

  await run('controller running 时 replay：取消旧运行并重演同一入边', async () => {
    const h = setup(definition3({ f0: { delay: 150 } }));
    try {
      const nextPromise = h.session.next();
      await T.wait(10);
      const replayResult = await h.session.replay();
      T.deq(replayResult, { status: 'completed', frameId: 'f1' }, 'replay 重演完成');
      T.deq(await nextPromise, { status: 'cancelled', frameId: 'f0' }, '旧运行 cancelled');
      T.eq(h.adapters.anim.records.performs.length, 2, '旧运行 + 重演各执行一次动作');
      T.eq(h.adapters.anim.records.performs[1].ctx.sourceView, h.plan.frames[0].views.seq, '重演仍从同一来源开始');
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f1', targetFrameId: null, replaying: false, error: null }, '重演后停在目标');
    } finally {
      h.dispose();
    }
  });

  await run('controller.reset：恢复初始点（含已在初始点也完整 restore）', async () => {
    const h = setup(definition3());
    try {
      await h.session.go('f2');
      const result = await h.session.reset();
      T.deq(result, { status: 'completed', frameId: 'f0' }, 'reset 恢复初始点');
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f0', targetFrameId: null, replaying: false, error: null }, 'reset 后状态');
      T.deq(idsOf(h), ['a', 'b'], 'reset 恢复初始 model');
      const before = h.adapters.anim.records.restores;
      const again = await h.session.reset();
      T.deq(again, { status: 'completed', frameId: 'f0' }, '已在初始点仍 completed');
      T.assert(h.adapters.anim.records.restores > before, '已在初始点也执行完整 restore');
    } finally {
      h.dispose();
    }
  });

  await run('controller running 时 reset：取消旧运行后回到初始点', async () => {
    const h = setup(definition3({ f0: { delay: 150 } }));
    try {
      const nextPromise = h.session.next();
      await T.wait(10);
      const resetResult = await h.session.reset();
      T.deq(resetResult, { status: 'completed', frameId: 'f0' }, 'reset 取消后 completed');
      T.deq(await nextPromise, { status: 'cancelled', frameId: 'f0' }, '旧运行 cancelled');
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f0', targetFrameId: null, replaying: false, error: null }, 'reset 后 idle');
      T.deq(idsOf(h), ['a', 'b'], 'reset 后初始画面');
    } finally {
      h.dispose();
    }
  });

  await run('controller model 不符：failed + error 状态 + 恢复 settled Frame', async () => {
    const h = setup(definition3({ f0: { mode: 'mismatch' } }));
    try {
      const captured = capture(h.session);
      const result = await h.session.next();
      T.eq(result.status, 'failed', 'model 不符应 failed');
      T.eq(result.frameId, 'f0', 'failed frameId 为 settled');
      T.assert(result.error && result.error.message, 'failed 带 error');
      const state = h.session.getState();
      T.eq(state.phase, 'error', '发布 error 状态');
      T.eq(state.settledFrameId, 'f0', 'settledFrameId 不变');
      T.eq(state.targetFrameId, null, 'error 时 targetFrameId 为 null');
      T.eq(state.replaying, false, 'error 时 replaying=false');
      T.eq(state.error.binding, 'seq', 'error.binding');
      T.eq(typeof state.error.action, 'string', 'error.action 是可显示字符串');
      T.eq(state.error.action, 'remove', 'error.action 内容');
      T.assert(String(state.error.message).indexOf('Frame') >= 0, 'error.message 含 Frame');
      T.assert(String(state.error.message).length > 0, 'error.message 非空');
      T.assert(captured.log.some(function (entry) { return entry.phase === 'error'; }), '订阅收到 error 状态');
      T.deq(idsOf(h), ['a', 'b'], '恢复失败后画面回到 settled 视图');
      T.eq(staticTextOf(h), '零', '静态视图恢复 settled');
      const recover = await h.session.go('f2');
      T.deq(recover, { status: 'completed', frameId: 'f2' }, 'error 后可再次导航');
      T.eq(h.session.getState().phase, 'idle', '成功导航清除 error');
    } finally {
      h.dispose();
    }
  });

  await run('controller cues 读回不符：failed + error', async () => {
    const anim = T.makeAdapter('anim', { ignoreCues: true });
    const adapters = { anim: anim, static: T.makeAdapter('static', { without: ['perform', 'readView', 'applyCues'] }) };
    const h = setup(definition3(), {}, adapters);
    try {
      const result = await h.session.next();
      T.eq(result.status, 'failed', 'cues 不符 failed');
      const state = h.session.getState();
      T.eq(state.phase, 'error', 'cues 不符进入 error');
      T.eq(state.settledFrameId, 'f0', 'settledFrameId 不变');
      T.eq(state.error.binding, 'seq', 'error.binding');
      T.assert(String(state.error.message).indexOf('cues') >= 0, 'error.message 说明 cues 不符');
    } finally {
      h.dispose();
    }
  });

  await run('controller 恢复失败：error.message 含恢复失败信息', async () => {
    const anim = T.makeAdapter('anim', { restoreThrowsAfter: 1 });
    const adapters = { anim: anim, static: T.makeAdapter('static', { without: ['perform', 'readView', 'applyCues'] }) };
    const h = setup(definition3({ f0: { mode: 'mismatch' } }), {}, adapters);
    try {
      const result = await h.session.next();
      T.eq(result.status, 'failed', '恢复失败仍 failed');
      const state = h.session.getState();
      T.eq(state.phase, 'error', '保持 error');
      T.eq(state.settledFrameId, 'f0', 'settledFrameId 不变');
      T.assert(String(state.error.message).indexOf('恢复') >= 0, 'error.message 含恢复失败信息');
      T.assert(String(state.error.message).indexOf('失败') >= 0, 'error.message 说明失败');
    } finally {
      h.dispose();
    }
  });

  await run('controller 动作自报 cancelled：回到 source 并返回 cancelled', async () => {
    const h = setup(definition3({ f0: { mode: 'selfcancel' } }));
    try {
      const result = await h.session.next();
      T.deq(result, { status: 'cancelled', frameId: 'f0' }, '组件 cancelled 视为 cancelled');
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f0', targetFrameId: null, replaying: false, error: null }, '回到 source');
      T.deq(idsOf(h), ['a', 'b'], '画面恢复来源');
    } finally {
      h.dispose();
    }
  });

  await run('controller 静态 binding 在动作运行期间恢复目标、取消后恢复来源', async () => {
    const h = setup(definition3({ f0: { delay: 150 } }));
    try {
      const seen = [];
      h.session.subscribe(function (state) {
        seen.push({
          phase: state.phase,
          settled: state.settledFrameId,
          target: state.targetFrameId,
          staticText: staticTextOf(h)
        });
      });
      const promise = h.session.next();
      T.eq(seen[seen.length - 1].phase, 'running', '已进入 running');
      T.eq(seen[seen.length - 1].staticText, '一', '静态 binding 在运行开始即恢复目标视图');
      await T.wait(10);
      const prevResult = await h.session.prev();
      T.deq(prevResult, { status: 'completed', frameId: 'f0' }, '取消后 prev completed');
      await promise;
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f0', targetFrameId: null, replaying: false, error: null }, '取消后 idle/source');
      T.eq(staticTextOf(h), '零', '取消后静态 binding 恢复来源视图');
      T.deq(idsOf(h), ['a', 'b'], '取消后动态 binding 恢复来源视图');
    } finally {
      h.dispose();
    }
  });

  await run('controller __reportError：进入 error 状态且不改变 settledFrameId', async () => {
    const h = setup(definition3());
    try {
      h.session.__reportError({ message: '必需标记目标缺失', binding: 'seq', query: { id: 'a' } });
      const state = h.session.getState();
      T.eq(state.phase, 'error', '进入 error');
      T.eq(state.settledFrameId, 'f0', '不改变 settledFrameId');
      T.eq(state.error.binding, 'seq', 'error.binding');
      T.eq(state.error.message, '必需标记目标缺失', 'error.message');
      T.eq(state.error.query.id, 'a', 'error.query 保留');
      const recovered = await h.session.go('f1');
      T.deq(recovered, { status: 'completed', frameId: 'f1' }, 'error 后可导航');
      T.eq(h.session.getState().error, null, '导航成功清除 error');
    } finally {
      h.dispose();
    }
  });

  await run('controller 并行动作：两类 Binding 同步 perform 后核对', async () => {
    const adapters = { anim: T.makeAdapter('anim'), other: T.makeAdapter('other') };
    const definition = {
      bindings: {
        seq: { adapter: 'anim', slot: 'main' },
        dom: { adapter: 'other', slot: 'main' }
      },
      frames: [
        { id: 'f0', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, dom: { text: '零' } } },
        { id: 'f1', views: { seq: { items: [{ id: 'a', label: 'A' }] }, dom: { text: '一' } } }
      ],
      transitions: [{ from: 'f0', to: 'f1', actions: [{ parallel: [
        { binding: 'seq', type: 'remove', params: { id: 'b' } },
        { binding: 'dom', type: 'set', params: { text: '一' } }
      ] }] }]
    };
    const slots = T.slots(['main']);
    const plan = D.prepare(definition, { adapters: adapters, initialFrameId: null });
    const bag = B.create({ plan: plan, slots: slots, adapters: adapters });
    bag.restoreFrame(plan.frameById.f0);
    const session = C.create({ plan: plan, bindings: bag, initialFrameId: plan.initialFrameId });
    try {
      const result = await session.next();
      T.deq(result, { status: 'completed', frameId: 'f1' }, '并行动作 completed');
      T.eq(adapters.anim.records.performs.length, 1, 'seq 执行动作');
      T.eq(adapters.other.records.performs.length, 1, 'dom 执行动作');
      T.deq(adapters.anim.records.instances[0].store.items.map(function (item) { return item.id; }), ['a'], 'seq 目标 model');
      T.eq(adapters.other.records.instances[0].store.text, '一', 'dom 目标 model');
    } finally {
      session.destroy();
      T.removeHost(slots);
    }
  });

  await run('controller 两会话隔离：状态与画面互不影响', async () => {
    const hA = setup(definition3());
    const hB = setup(definition3());
    try {
      T.deq(await hA.session.next(), { status: 'completed', frameId: 'f1' }, 'A 导航');
      T.deq(hA.session.getState(), { phase: 'idle', settledFrameId: 'f1', targetFrameId: null, replaying: false, error: null }, 'A 状态');
      T.deq(hB.session.getState(), { phase: 'idle', settledFrameId: 'f0', targetFrameId: null, replaying: false, error: null }, 'B 状态不受影响');
      T.deq(idsOf(hB), ['a', 'b'], 'B 画面不受影响');
      T.eq(staticTextOf(hB), '零', 'B 静态画面不受影响');
      hA.session.destroy();
      T.eq(hA.session.getState().phase, 'disposed', 'A 销毁');
      T.deq(await hB.session.next(), { status: 'completed', frameId: 'f1' }, 'B 仍可导航');
      T.deq(idsOf(hB), ['a'], 'B 画面更新');
    } finally {
      hA.dispose();
      hB.dispose();
    }
  });

  await run('controller borrowed 绑定：会话销毁不销毁外部实例', async () => {
    const anim = T.makeAdapter('anim');
    const owned = T.makeAdapter('other');
    const borrowedInstance = { destroyed: false, value: '', el: document.createElement('div') };
    document.body.appendChild(borrowedInstance.el);
    const adapters = { anim: anim, other: owned };
    const slots = T.slots(['main']);
    const definition = {
      bindings: {
        seq: { adapter: 'anim', slot: 'main', instance: borrowedInstance },
        dom: { adapter: 'other', slot: 'main' }
      },
      frames: [
        { id: 'f0', views: { seq: { items: [], text: 'f0' }, dom: { text: 'x' } } },
        { id: 'f1', views: { seq: { items: [], text: 'f1' }, dom: { text: 'y' } } }
      ],
      transitions: []
    };
    const plan = D.prepare(definition, { adapters: adapters, initialFrameId: null });
    const bag = B.create({ plan: plan, slots: slots, adapters: adapters });
    bag.restoreFrame(plan.frameById.f0);
    const session = C.create({ plan: plan, bindings: bag, initialFrameId: plan.initialFrameId });
    try {
      await session.next();
      T.eq(borrowedInstance.value, 'f1', '借用实例执行受控恢复');
      T.eq(owned.records.instances[0].store.text, 'y', 'owned 绑定正常恢复');
    } finally {
      session.destroy();
      T.assert(borrowedInstance.destroyed === false, '外部实例未被销毁');
      T.assert(anim.records.handleDestroys >= 1, 'borrowed handle 解除管理');
      T.eq(owned.records.handleDestroys, 1, 'owned 实例被销毁');
      T.eq(slots.main.querySelectorAll('.note-demo-binding').length, 0, '容器清理');
      if (borrowedInstance.el.parentNode) borrowedInstance.el.parentNode.removeChild(borrowedInstance.el);
      T.removeHost(slots);
    }
  });

  await run('controller.destroy：同步 disposed、旧 Promise cancelled、幂等与清理', async () => {
    const h = setup(definition3({ f0: { delay: 300 } }));
    try {
      const promise = h.session.next();
      await T.wait(10);
      T.eq(h.session.getState().phase, 'running', '销毁前运行中');
      h.session.destroy();
      T.eq(h.session.getState().phase, 'disposed', 'destroy 同步发布 disposed');
      const result = await promise;
      T.deq(result, { status: 'cancelled', frameId: 'f0' }, '运行中的 Promise 结算为 cancelled');
      T.assert(h.adapters.anim.records.cancels >= 1, '动作被取消');
      T.assert(h.adapters.anim.records.handleDestroys >= 1, 'binding handle 被销毁');
      T.eq(h.adapters.static.records.handleDestroys >= 1, true, '静态 binding handle 被销毁');
      T.eq(h.slots.main.querySelectorAll('.note-demo-binding').length, 0, '管理容器被移除');
      const destroys = h.adapters.anim.records.handleDestroys;
      h.session.destroy();
      T.eq(h.adapters.anim.records.handleDestroys, destroys, 'destroy 幂等');
      T.eq(h.session.getState().phase, 'disposed', '幂等后仍 disposed');
      T.deq(await h.session.next(), { status: 'noop', reason: 'disposed', frameId: 'f0' }, 'destroy 后 next noop disposed');
      T.deq(await h.session.go('f2'), { status: 'noop', reason: 'disposed', frameId: 'f0' }, 'destroy 后 go noop disposed');
      T.deq(await h.session.reset(), { status: 'noop', reason: 'disposed', frameId: 'f0' }, 'destroy 后 reset noop disposed');
      T.deq(await h.session.replay(), { status: 'noop', reason: 'disposed', frameId: 'f0' }, 'destroy 后 replay noop disposed');
      T.deq(await h.session.prev(), { status: 'noop', reason: 'disposed', frameId: 'f0' }, 'destroy 后 prev noop disposed');
      let calls = 0;
      const unsubscribe = h.session.subscribe(function (state) {
        calls += 1;
        T.eq(state.phase, 'disposed', 'destroy 后 subscribe 立即回调 disposed');
      });
      T.eq(calls, 1, 'destroy 后 subscribe 立即回调一次');
      T.eq(typeof unsubscribe, 'function', '返回空操作 unsubscribe');
      unsubscribe();
      h.session.__reportError({ message: '不应生效' });
      T.eq(h.session.getState().phase, 'disposed', 'destroy 后 __reportError 不改变状态');
    } finally {
      h.dispose();
    }
  });

  await run('controller 旧 Promise 迟到不提交位置/画面', async () => {
    const h = setup(definition3({ f0: { delay: 150, ignoreCancel: true } }));
    try {
      const nextPromise = h.session.next();
      await T.wait(10);
      const prevResult = await h.session.prev();
      T.deq(prevResult, { status: 'completed', frameId: 'f0' }, '取消后回到 source');
      const late = await nextPromise;
      T.deq(late, { status: 'cancelled', frameId: 'f0' }, '旧 Promise 迟到也结算 cancelled');
      await T.wait(150);
      T.deq(h.session.getState(), { phase: 'idle', settledFrameId: 'f0', targetFrameId: null, replaying: false, error: null }, '迟到完成不提交位置');
      T.deq(idsOf(h), ['a', 'b'], '迟到完成不提交画面');
      T.eq(staticTextOf(h), '零', '迟到完成不提交静态画面');
    } finally {
      h.dispose();
    }
  });

  return results;
};

const GROUP_REDUCED = async () => {
  const T = window.__t;
  const D = window.NoteDemoInternals.definition;
  const B = window.NoteDemoInternals.bindings;
  const C = window.NoteDemoInternals.controller;
  const results = [];
  const run = async (name, fn) => {
    try {
      await fn();
      results.push({ name: name, ok: true });
    } catch (error) {
      results.push({ name: name, ok: false, error: String((error && error.stack) || error) });
    }
  };

  await run('减少动效：controller 传 reduced，动作 completed 且不等待动画时长', async () => {
    T.assert(NoteCore.motion.reduced() === true, '当前页面应处于 prefers-reduced-motion: reduce');
    const anim = T.makeAdapter('anim');
    const adapters = { anim: anim, static: T.makeAdapter('static', { without: ['perform', 'readView', 'applyCues'] }) };
    const slots = T.slots(['main']);
    const definition = {
      bindings: {
        seq: { adapter: 'anim', slot: 'main' },
        dom: { adapter: 'static', slot: 'main' }
      },
      frames: [
        { id: 'f0', views: { seq: { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, dom: { text: '零' } } },
        { id: 'f1', views: { seq: { items: [{ id: 'a', label: 'A' }], focus: ['a'] }, dom: { text: '一' } } }
      ],
      transitions: [{ from: 'f0', to: 'f1', actions: [{ binding: 'seq', type: 'remove', params: { id: 'b', delay: 400 } }] }]
    };
    const plan = D.prepare(definition, { adapters: adapters, initialFrameId: null });
    const bag = B.create({ plan: plan, slots: slots, adapters: adapters });
    bag.restoreFrame(plan.frameById.f0);
    const session = C.create({ plan: plan, bindings: bag, initialFrameId: plan.initialFrameId });
    try {
      const started = Date.now();
      const result = await session.next();
      const elapsed = Date.now() - started;
      T.deq(result, { status: 'completed', frameId: 'f1' }, '减少动效也 completed');
      T.eq(anim.records.performs[0].ctx.motion, 'reduced', 'ctx.motion=reduced');
      T.assert(elapsed < 250, '减少动效不等待动画时长（实际 ' + elapsed + 'ms）');
      T.deq(session.getState(), { phase: 'idle', settledFrameId: 'f1', targetFrameId: null, replaying: false, error: null }, '状态完成');
      T.deq(anim.records.instances[0].store.items.map(function (item) { return item.id; }), ['a'], '组件到达目标 model');
    } finally {
      session.destroy();
      T.removeHost(slots);
    }
  });

  return results;
};

async function main() {
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push('console.error: ' + message.text());
    });
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><title>core-check</title></head><body></body></html>');
    for (const relative of SCRIPTS) {
      await page.addScriptTag({ path: path.join(projectDir, relative) });
    }
    await page.evaluate(installHelpers);

    await runGroup('definition', () => page.evaluate(GROUP_DEFINITION));
    await runGroup('bindings', () => page.evaluate(GROUP_BINDINGS));
    await runGroup('runner', () => page.evaluate(GROUP_RUNNER));
    await runGroup('controller', () => page.evaluate(GROUP_CONTROLLER));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      await runGroup('reduced-motion', () => page.evaluate(GROUP_REDUCED));
    } finally {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }

    if (pageErrors.length) fail('页面出现错误：\n' + pageErrors.join('\n'));
    console.log('core-check 全部通过，共 ' + checks + ' 项。');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});