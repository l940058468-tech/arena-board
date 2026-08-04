const fs = require('fs');
const path = require('path');

const BASE = 'https://lolalytics.com';
const OUT_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(OUT_DIR, 'arena-stats.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const RARITY = { 0: 'silver', 1: 'gold', 2: 'prismatic', 4: 'special' };
const TIER_LABELS = [
  '',
  'S+',
  'S',
  'S-',
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const out = { limit: 0, concurrency: 6, patch: '' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') out.limit = Number(argv[++i]) || 0;
    if (arg === '--concurrency') out.concurrency = Number(argv[++i]) || 6;
    if (arg === '--patch') out.patch = String(argv[++i] || '');
  }
  return out;
}

async function fetchJson(url, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          Referer: `${BASE}/lol/tierlist/arena/`,
        },
      });
      if (res.status === 200) {
        return await res.json();
      }
      if (res.status === 429 || res.status === 403) {
        lastError = new Error(`HTTP ${res.status} for ${url}`);
        await sleep(1200 * attempt + Math.random() * 900);
        continue;
      }
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      await sleep(500 * attempt);
    } catch (error) {
      lastError = error;
      await sleep(800 * attempt);
    }
  }
  throw lastError;
}

const B36_RE = /^[0-9a-z]+$/;

function parseQwik(json) {
  const objs = json._objs;
  const memo = new Map();

  function refIndex(value) {
    if (typeof value !== 'string' || !B36_RE.test(value) || value.length > 7) {
      return null;
    }
    const index = parseInt(value, 36);
    if (!Number.isFinite(index) || index < 0 || index >= objs.length) {
      return null;
    }
    return index;
  }

  function resolve(index, seen) {
    if (memo.has(index)) return memo.get(index);
    if (seen.has(index)) return null;
    seen.add(index);
    const raw = objs[index];
    let out;
    if (Array.isArray(raw)) {
      out = raw.map((item) => {
        const ri = refIndex(item);
        return ri === null ? item : resolve(ri, seen);
      });
    } else if (raw && typeof raw === 'object') {
      out = {};
      for (const [key, value] of Object.entries(raw)) {
        const ri = refIndex(value);
        out[key] = ri === null ? value : resolve(ri, seen);
      }
    } else {
      out = raw;
    }
    memo.set(index, out);
    return out;
  }

  return {
    objs,
    refIndex,
    resolve: (index) => resolve(index, new Set()),
  };
}

function findObject(objs, predicate) {
  for (let i = 0; i < objs.length; i++) {
    const value = objs[i];
    if (value && typeof value === 'object' && !Array.isArray(value) && predicate(value)) {
      return i;
    }
  }
  return -1;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function extractTierlist(json) {
  const { objs, resolve } = parseQwik(json);

  const metaIndex = findObject(
    objs,
    (o) =>
      'patch' in o &&
      'champions' in o &&
      'champTitles' in o &&
      'champPath' in o &&
      'champId' in o &&
      'strings' in o &&
      'tips' in o
  );
  if (metaIndex < 0) throw new Error('Tier list metadata not found');
  const meta = resolve(metaIndex);

  const names = Object.values(meta.champions);
  const titles = Object.values(meta.champTitles);
  const idByKey = meta.champId;
  const tips = meta.tips || {};
  const keyByName = {};
  for (const [key, name] of Object.entries(meta.champions)) {
    keyByName[name] = key;
  }

  const rowIndexes = [];
  for (let i = 0; i < objs.length; i++) {
    const value = objs[i];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value).sort().join(',');
      if (keys === 'avgWrDelta,br,games,pr,rank,tier,wr') {
        rowIndexes.push(i);
      }
    }
  }
  if (rowIndexes.length !== names.length) {
    throw new Error(`Tier row count mismatch: ${rowIndexes.length} vs ${names.length}`);
  }

  const firstRowIndex = rowIndexes[0];
  const avgWr =
    typeof objs[firstRowIndex - 7] === 'number' ? objs[firstRowIndex - 7] : tips.averageWr;
  const analysedGames =
    typeof objs[firstRowIndex - 6] === 'number' ? objs[firstRowIndex - 6] : tips.analysed;

  const champions = rowIndexes.map((rowIndex, idx) => {
    const row = resolve(rowIndex);
    const key = keyByName[names[idx]];
    return {
      id: idByKey[key] ?? null,
      key,
      name: names[idx],
      title: titles[idx],
      tier: TIER_LABELS[row.tier] ?? row.tier,
      rank: row.rank,
      wr: row.wr,
      avgWrDelta: row.avgWrDelta,
      pr: row.pr,
      games: row.games,
      br: row.br,
    };
  });

  return {
    patch: meta.patch,
    avgWr,
    analysedGames,
    champions,
  };
}

function extractChampionBuild(json) {
  const { objs, resolve } = parseQwik(json);

  let augmentMapIndex = -1;
  for (let i = 0; i < objs.length; i++) {
    const value = objs[i];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const keys = Object.keys(value);
    if (!keys.length || !keys.every((key) => /^\d+$/.test(key))) continue;
    const resolved = resolve(i);
    const firstValue = resolved[keys[0]];
    if (Array.isArray(firstValue) && firstValue.length === 2) {
      augmentMapIndex = i;
      break;
    }
  }
  if (augmentMapIndex < 0) throw new Error('Augment map not found');
  const augmentMap = resolve(augmentMapIndex);

  const tableIndex = findObject(
    objs,
    (o) => {
      const keys = Object.keys(o).sort();
      return keys.join(',') === 'augment0,augment1,augment2,augment3,augment4';
    }
  );
  if (tableIndex < 0) throw new Error('Augment table not found');
  const table = resolve(tableIndex);

  const headerIndex = findObject(
    objs,
    (o) =>
      'cid' in o &&
      'n' in o &&
      'wr' in o &&
      'pr' in o &&
      'rank' in o &&
      'rankTotal' in o &&
      'tier' in o
  );
  if (headerIndex < 0) throw new Error('Champion header not found');
  const header = resolve(headerIndex);

  const aggregate = new Map();
  for (const slot of ['augment0', 'augment1', 'augment2', 'augment3', 'augment4']) {
    const rows = table[slot] || [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 4) continue;
      const [aid, wr, , games] = row;
      if (typeof games !== 'number' || !Number.isFinite(games) || games <= 0) continue;
      const metaAug = augmentMap[String(aid)];
      const rarity = metaAug ? metaAug[1] : null;
      if (rarity !== 0 && rarity !== 1 && rarity !== 2) continue;
      const current = aggregate.get(aid) || { games: 0, wrSum: 0 };
      current.games += games;
      current.wrSum += wr * games;
      aggregate.set(aid, current);
    }
  }

  const totalGames = header.n || 0;
  const augments = { silver: [], gold: [], prismatic: [] };
  for (const [aid, current] of aggregate) {
    const metaAug = augmentMap[String(aid)];
    const name = metaAug ? metaAug[0] : `Augment ${aid}`;
    const rarity = metaAug ? metaAug[1] : null;
    const entry = {
      id: aid,
      name,
      wr: round(current.wrSum / current.games),
      pr: round(totalGames > 0 ? (current.games / totalGames) * 100 : 0),
      games: Math.round(current.games),
    };
    augments[RARITY[rarity]].push(entry);
  }

  for (const list of Object.values(augments)) {
    list.sort((a, b) => b.games - a.games);
  }

  return {
    header: {
      n: header.n,
      wr: header.wr,
      pr: header.pr,
      rank: header.rank,
      rankTotal: header.rankTotal,
      tier: header.tier,
    },
    augments,
  };
}

async function scrapeChampion(champion) {
  const url = `${BASE}/lol/${champion.key}/arena/build/q-data.json`;
  try {
    const json = await fetchJson(url);
    const build = extractChampionBuild(json);
    return { ...champion, augments: build.augments, detail: build.header };
  } catch (error) {
    console.error(`  failed ${champion.key}: ${error.message}`);
    return { ...champion, augments: null, detail: null, error: error.message };
  }
}

async function run() {
  const options = parseArgs(process.argv);
  const tierUrl = `${BASE}/lol/tierlist/arena/q-data.json`;
  console.log(`Fetching arena tier list from ${tierUrl}`);
  const tierJson = await fetchJson(tierUrl);
  const tier = extractTierlist(tierJson);
  console.log(`Patch ${tier.patch}, ${tier.champions.length} champions, avg WR ${tier.avgWr}%`);

  const champions = options.limit ? tier.champions.slice(0, options.limit) : tier.champions;
  const results = [];
  let completed = 0;

  for (let start = 0; start < champions.length; start += options.concurrency) {
    const batch = champions.slice(start, start + options.concurrency);
    const batchResults = await Promise.all(batch.map(scrapeChampion));
    results.push(...batchResults);
    completed += batchResults.length;
    if (completed % 10 === 0 || completed === champions.length) {
      console.log(`  progress ${completed}/${champions.length}`);
    }
    if (start + options.concurrency < champions.length) {
      await sleep(120);
    }
  }

  const payload = {
    patch: tier.patch,
    source: 'lolalytics',
    sourceUrl: 'https://lolalytics.com/lol/tierlist/arena/',
    updatedAt: new Date().toISOString(),
    avgWr: tier.avgWr,
    analysedGames: tier.analysedGames,
    champions: results,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_FILE} (${payload.champions.length} champions)`);

  const failed = payload.champions.filter((c) => c.error);
  if (failed.length) {
    console.warn(`${failed.length} champion pages failed: ${failed.map((c) => c.key).join(', ')}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
