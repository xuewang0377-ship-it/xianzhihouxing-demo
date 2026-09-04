/* ═══════════════════════════════════════════════════════════
   先知后行 · 静态演示版垫片
   拦截所有 api/* 请求，改由本地虚拟数据包响应。
   后端 diagnose 计算逻辑已按原实现移植为前端 JS。
   本文件不含任何真实业务数据。
   ═══════════════════════════════════════════════════════════ */
(function () {
  var DB = null;
  var ready = fetch('demo-data.json').then(function (r) { return r.json(); }).then(function (d) { DB = d; return d; });

  var TIER_LABEL = { '1_1-5w': '1-5w', '2_5-10w': '5-10w', '3_10-50w': '10-50w', '4_50-100w': '50-100w', '5_100-300w': '100-300w', '6_300w+': '300w+' };
  function tierOf(f) {
    if (f >= 3000000) return '6_300w+';
    if (f >= 1000000) return '5_100-300w';
    if (f >= 500000) return '4_50-100w';
    if (f >= 100000) return '3_10-50w';
    if (f >= 50000) return '2_5-10w';
    return '1_1-5w';
  }
  var BMIDX = null;
  function bmIndex() {
    if (BMIDX) return BMIDX;
    BMIDX = {};
    DB.benchmark.forEach(function (r) { BMIDX[r.taxonomy_l1 + '|' + r.fans_tier] = r; });
    return BMIDX;
  }
  function getBenchmark(tax, fans) {
    var tier = tierOf(fans), idx = bmIndex();
    if (tax) {
      var row = idx[tax + '|' + tier];
      if (row && (row.creator_cnt || 0) >= 30) return [row, tax + ' · ' + TIER_LABEL[tier] + '粉丝段'];
    }
    return [idx['__ALL__|' + tier] || {}, '全站 · ' + TIER_LABEL[tier] + '粉丝段'];
  }
  /* 与后端 percentile_position 完全一致的线性插值 + 对数外推 */
  function pctPos(value, p25, p50, p75, p90) {
    if (value === null || value === undefined || value === '') return null;
    value = Number(value);
    if (isNaN(value)) return null;
    var pts = [[0, 0]];
    [[25, p25], [50, p50], [75, p75], [90, p90]].forEach(function (t) {
      if (t[1] === null || t[1] === undefined) return;
      if (pts.length && Number(t[1]) <= pts[pts.length - 1][1]) return;
      pts.push([t[0], Number(t[1])]);
    });
    if (pts.length < 2) return null;
    if (value <= pts[0][1]) return 0;
    for (var i = 1; i < pts.length; i++) {
      var lo = pts[i - 1], hi = pts[i];
      if (value <= hi[1]) {
        if (hi[1] === lo[1]) return hi[0];
        return Math.round((lo[0] + (value - lo[1]) / (hi[1] - lo[1]) * (hi[0] - lo[0])) * 10) / 10;
      }
    }
    var last = pts[pts.length - 1];
    var ratio = last[1] ? value / last[1] : 1;
    return Math.round(Math.min(99, last[0] + 9 * Math.min(1, ratio - 1)) * 10) / 10;
  }
  function grade(p) { if (p === null || p === undefined) return '无数据'; if (p >= 75) return '优'; if (p >= 40) return '良'; return '待提升'; }
  function avg(vals) { var xs = vals.filter(function (v) { return v !== null && v !== undefined; }); return xs.length ? Math.round(xs.reduce(function (a, b) { return a + b; }, 0) / xs.length * 10) / 10 : null; }
  var WEIGHTS = { '潜力电商规模': .40, '近30日K播DGMV': .40, '电商粉丝数': .10, '粉丝客单价': .10 };
  function weighted(items) {
    var num = 0, den = 0;
    Object.keys(items).forEach(function (k) {
      var v = items[k], w = WEIGHTS[k];
      if (v === null || v === undefined || w === undefined) return;
      num += v * w; den += w;
    });
    if (den <= 0) return avg(Object.keys(items).map(function (k) { return items[k]; }));
    return Math.round(num / den * 10) / 10;
  }

  function diagnose(p) {
    var fans = parseInt(p.fans_num || 0, 10);
    if (!fans) throw new Error('缺少 fans_num');
    var g = getBenchmark(p.taxonomy_l1, fans), bm = g[0], label = g[1];
    function pos(key, pre) { return pctPos(p[key], bm[pre + '_p25'], bm[pre + '_p50'], bm[pre + '_p75'], bm[pre + '_p90']); }
    function item(label, value, pct, unit, win, src, p50, p90, note) {
      return { label: label, value: value, pct: pct, unit: unit, window: win, source: src, p50: p50 === undefined ? null : p50, p90: p90 === undefined ? null : p90, note: note || null };
    }
    var ces = p.ces_30d, cesD = false;
    if (!ces && p.note_num_30d && p.avg_engage_30d) { ces = p.note_num_30d * p.avg_engage_30d; cesD = true; }
    var ecmF = [
      item('潜力电商规模', p.potential_ecm_scale, pos('potential_ecm_scale', 'potscale'), '元', '近30日', '演示数据 · 电商粉丝数 × 粉丝客单价', bm.potscale_p50, bm.potscale_p90),
      item('近30日K播DGMV', p.buyer_klive_dgmv_30d, pos('buyer_klive_dgmv_30d', 'klivedgmv'), '元', '近30日', '演示数据 · 仅在有带货记录的人群内排分位', bm.klivedgmv_p50, bm.klivedgmv_p90),
      item('电商粉丝数', p.ecm_fans_30d, pctPos(p.ecm_fans_30d, null, bm.ecmfans_p50, null, bm.ecmfans_p90), '人', '近30日', '演示数据', bm.ecmfans_p50, bm.ecmfans_p90),
      item('粉丝客单价', p.fans_aov_30d, pos('fans_aov_30d', 'aov'), '元', '近30日', '演示数据 · 全站口径平均单笔成交额', bm.aov_p50, bm.aov_p90)
    ];
    var conF = [
      item('近30日发文数', p.note_num_30d, pctPos(p.note_num_30d, null, bm.notenum_p50, null, bm.notenum_p90), '篇', '近30日', '演示数据', bm.notenum_p50, bm.notenum_p90),
      item('篇均互动', p.avg_engage_30d, pos('avg_engage_30d', 'engage'), '次', '近30日', '演示数据 · 点赞+收藏+评论', bm.engage_p50, bm.engage_p90),
      item('互动率', p.engage_rate_30d, pctPos(p.engage_rate_30d, null, bm.engrate_p50, null, bm.engrate_p90), '‰', '近30日', '演示数据 · 互动量 / 阅读量', bm.engrate_p50, bm.engrate_p90),
      item('30日总互动量', ces, pctPos(ces, null, (bm.engage_p50 || 0) * (bm.notenum_p50 || 0) || null, null, (bm.engage_p90 || 0) * (bm.notenum_p90 || 0) || null), '', '近30日', '篇均互动 × 发文数' + (cesD ? '；推算值' : ''), null, null, cesD ? '推算值' : null)
    ];
    var isBp = !!p.is_brand_partner;
    var pgyF = [
      item('图文报价', p.pgy_pic_price, pos('pgy_pic_price', 'picprice'), '元', '当前挂牌', '演示数据 · 仅在已开通品牌合作且有报价的人群内排分位', bm.picprice_p50, bm.picprice_p90),
      item('视频报价', p.pgy_video_price, pos('pgy_video_price', 'vidprice'), '元', '当前挂牌', '演示数据', bm.vidprice_p50, bm.vidprice_p90),
      item('近一年合作品牌数', p.pgy_order_cnt_365d, pctPos(p.pgy_order_cnt_365d, null, bm.dealcnt_p50, null, bm.dealcnt_p90), '个', '近365日', '演示数据 · 已完成订单去重品牌数', bm.dealcnt_p50, bm.dealcnt_p90),
      item('近一年商单流水', p.pgy_revenue_365d, pctPos(p.pgy_revenue_365d, null, bm.dealrev_p50, null, bm.dealrev_p90), '元', '近365日', '演示数据 · 税前报价合计', bm.dealrev_p50, bm.dealrev_p90)
    ];
    function toMap(arr) { var m = {}; arr.forEach(function (i) { m[i.label] = i.pct; }); return m; }
    var ecmI = toMap(ecmF), conI = toMap(conF), pgyI = toMap(pgyF);
    var ecmS = weighted(ecmI), conS = avg(Object.keys(conI).map(function (k) { return conI[k]; })), pgyS = avg(Object.keys(pgyI).map(function (k) { return pgyI[k]; }));
    var pgyState = 'normal';
    if (!isBp && !p.pgy_order_cnt_365d) { pgyState = 'not_opened'; pgyS = null; }
    var pot = p.potential_ecm_scale, gmv = null;
    if (pot) {
      var calc = function (r, m) { return Math.round(pot * r * m); };
      gmv = {
        potential_ecm_scale: pot, activation_rate_default: .034, aov_multiplier_default: 2,
        formula: '目标 GMV = 潜力电商规模 × 激活率 × 客单上翻系数',
        scenarios: {
          '保守': { value: calc(.02, 1.5), rate: .02, mult: 1.5, why: '激活率取 2.0%，客单上翻 1.5 倍。适用于首播、无预约积累、货盘未磨合' },
          '中性': { value: calc(.034, 2), rate: .034, mult: 2, why: '激活率取基准 3.4%，客单上翻 2 倍。适用于预热到位、货盘结构合理' },
          '激进': { value: calc(.05, 2.5), rate: .05, mult: 2.5, why: '激活率取 5.0%，客单上翻 2.5 倍。需公域+投流双轮驱动，且有高客单镇场品' }
        },
        note: '演示版：激活率 3.4% 为示意基准，非真实业务口径。'
      };
    }
    var bmOut = {}; Object.keys(bm).forEach(function (k) { if (k !== 'taxonomy_l1' && k !== 'fans_tier') bmOut[k] = bm[k]; });
    return {
      nickname: p.nickname, user_id: p.user_id, source: 'demo', fans_num: fans,
      fans_tier: TIER_LABEL[tierOf(fans)], benchmark_label: label, benchmark_sample: bm.creator_cnt,
      scores: {
        '蒲公英': { score: pgyS, grade: grade(pgyS), state: pgyState, items: pgyI, detail: pgyF },
        '电商': { score: ecmS, grade: grade(ecmS), items: ecmI, detail: ecmF, weights: WEIGHTS },
        '内容': { score: conS, grade: grade(conS), items: conI, detail: conF }
      },
      gmv_model: gmv, benchmark: bmOut
    };
  }

  function J(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }

  function route(path, opt) {
    var body = {};
    if (opt && opt.body) { try { body = JSON.parse(opt.body); } catch (e) { body = {}; } }
    var m;

    if (path === 'api/meta') return J(DB.meta);
    if (path === 'api/benchmark') return J(DB.benchmark);
    if (path === 'api/case/mgmm') return J(DB.case);

    if ((m = path.match(/^api\/buyers\/search/))) {
      var q = decodeURIComponent((path.split('q=')[1] || '').split('&')[0]).trim();
      var items = [];
      if (q) {
        var ql = q.toLowerCase();
        items = DB.slim.filter(function (b) {
          return (b.user_nickname || '').toLowerCase().indexOf(ql) >= 0 || (b.user_id || '').indexOf(q) >= 0;
        }).slice(0, 20);
      }
      return J({ items: items, total: items.length });
    }
    if ((m = path.match(/^api\/buyer\/(.+)$/))) {
      var b = DB.buyers[decodeURIComponent(m[1])];
      if (!b) return J({ detail: '演示池中无此账号' }, 404);
      var o = {}; Object.keys(b).forEach(function (k) { o[k] = b[k]; });
      var pf = DB.fans_profile[b.user_id];
      if (pf) { o.fans_age_rate = JSON.stringify(pf.age); o.fans_top10_city_rate = JSON.stringify(pf.city); }
      return J(o);
    }
    if ((m = path.match(/^api\/category\/(.+)$/))) {
      var c = DB.categories[decodeURIComponent(m[1])];
      return c ? J(c) : J({ detail: '演示品类不存在' }, 404);
    }
    if ((m = path.match(/^api\/knowledge\/(.+)$/))) {
      var k = DB.knowledge[decodeURIComponent(m[1])];
      return k ? J(k) : J({ detail: '无知识层' }, 404);
    }
    if ((m = path.match(/^api\/fans-purchase-real\/(.+)$/)) || (m = path.match(/^api\/fans-purchase\/(.+)$/))) {
      var uid = decodeURIComponent(m[1]), rec = DB.fans_purchase[uid];
      if (rec) { var r2 = { user_id: uid, available: true, source: 'demo' }; Object.keys(rec).forEach(function (x) { r2[x] = rec[x]; }); return J(r2); }
      return J({ user_id: uid, available: false, reason: '该演示账号未纳入粉丝购买数据范围', cats: [], brands: [], anchors: [] });
    }
    if (path === 'api/diagnose') {
      try { return J(diagnose(body)); } catch (e) { return J({ detail: String(e.message || e) }, 400); }
    }
    if (path === 'api/match') {
      var tax = body.taxonomy_l1 || body.taxonomy || '', fans = body.fans_num || 0;
      var key = tax + '__' + tierOf(fans);
      var pool = DB.peers[key];
      if (!pool) { var ks = Object.keys(DB.peers).filter(function (x) { return x.indexOf(tax + '__') === 0; }); pool = ks.length ? DB.peers[ks[0]] : []; }
      return J({ items: pool.slice(0, 10), total: pool.length, label: tax + ' · ' + TIER_LABEL[tierOf(fans)] + '粉丝段（演示）' });
    }
    if (path === 'api/ai/category-insight') {
      var nm = body.name, part = (body.part || 'stock').toLowerCase();
      var txt = (part === 'content' ? DB.ai.content : DB.ai.stock)[nm] || '（演示预置内容缺失）';
      return J({ text: txt, source: 'demo-preset', category: nm, part: part });
    }
    if (path === 'api/ai/diagnosis-insight') return J({ text: DB.ai.diagnosis, source: 'demo-preset', has_fans_buy: true });
    if (path === 'api/ai/live-plan') return J({ text: DB.ai.liveplan, source: 'demo-preset' });
    if (path === 'api/ai/peer-insight') return J({ text: DB.ai.peer, source: 'demo-preset' });
    if (path === 'api/ai/status') return J({ ok: true, mode: 'demo-preset' });

    return J({ detail: '演示版未实现该接口：' + path }, 404);
  }

  var raw = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var clean = url.replace(/^\.?\//, '');
    if (clean.indexOf('api/') === 0) {
      return ready.then(function () { return route(clean, init || (typeof input === 'object' ? input : null)); });
    }
    // 演示版禁止任何外部/内网请求
    if (/^https?:\/\//i.test(url)) {
      return Promise.resolve(J({ detail: '演示版已禁用外部请求' }, 403));
    }
    return raw(input, init);
  };
})();
