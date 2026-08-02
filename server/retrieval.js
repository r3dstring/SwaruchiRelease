import { all } from './db.js';

const TOPIC_KEYWORDS = {
  'Crude-to-product basics / Petrochemical basics': ['crude','distillation','fraction','naphtha','gasoline','diesel','kerosene','petrochemical','polymer','olefin','aromatic','feedstock','boiling','refining'],
  'Refinery economics & margins': ['margin','gross refining','grm','crack spread','netback','opex','capex','yield','economics','profit','cost','pricing','valuation'],
  'Safety fundamentals': ['safety','hazard','ppe','permit','loto','lockout','confined space','hot work','msds','toxic','flammable','lel','h2s','risk assessment','psm'],
  'Emergency response': ['emergency','evacuation','fire','alarm','esd','shutdown','mutual aid','incident command','firewater','deluge','assembly point','rescue'],
  'CDU / VDU': ['cdu','vdu','crude distillation','vacuum distillation','atmospheric','desalter','preheat','furnace','overhead','sidecut','residue','stripping','flash zone'],
  'DHDT / NHT': ['dhdt','nht','hydrotreat','hydrodesulfurization','hds','naphtha hydrotreater','diesel hydrotreater','sulfur','reactor','catalyst','hydrogen partial','wabt','sour'],
  'DCU': ['dcu','coker','delayed coking','coke drum','decoking','cutting','furnace','thermal cracking','vgo','anode','petcoke','drum switching'],
  'FCC / RFCC': ['fcc','rfcc','catalytic cracking','regenerator','riser','catalyst circulation','slurry','cyclone','e-cat','fluidized','main fractionator','afterburn'],
  'HCU': ['hcu','hydrocracker','hydrocracking','conversion','recycle gas','makeup hydrogen','quench','exotherm','temperature runaway','catalyst bed','hpna'],
  'Hydrogen Generation': ['hydrogen generation','smr','steam methane','reformer','psa','shift converter','syngas','hgu','methanation','steam carbon ratio','reforming'],
  'Sulphur Recovery': ['sru','sulphur recovery','sulfur recovery','claus','tail gas','amine','acid gas','h2s','so2','incinerator','degassing','sulfur pit'],
  'Utilities & Offsites': ['utility','offsite','boiler','steam','cooling water','instrument air','nitrogen','flare','effluent','etp','demineralized','dm water','power plant','tankage','prds','bfw','condensate'],
  'Petrochemical Units': ['polypropylene','polyethylene','polymerization','extruder','pellet','propylene','ethylene','monomer','catalyst injection','reactor bed','degassing','granule'],
  'Operating parameters & limits': ['operating parameter','operating limit','operating envelope','design limit','alarm limit','trip point','setpoint','normal operating','safe operating','iow','integrity operating window'],
  'Common upsets & responses': ['upset','deviation','high level','low flow','trip','response','corrective action','abnormal','excursion','surge','carryover','foaming','flooding'],
  'Startup / shutdown sequences': ['startup','shutdown','commissioning','purge','inertization','warm up','lineup','depressurization','cool down','sequence','pre-startup','pssr','first fill'],
  'Incident insights (from RCFAs)': ['incident','rcfa','root cause','failure analysis','investigation','lesson learned','near miss','accident','why analysis','contributing factor'],
  'Motor control & protection': ['motor','mcc','starter','overload','relay protection','thermal overload','contactor','dol','star delta','vfd','soft starter','winding','insulation resistance'],
  'Switchgear & breakers': ['switchgear','breaker','circuit breaker','vcb','acb','busbar','isolator','protection relay','arc flash','racking','tripping','closing coil','interlock'],
  'Power distribution': ['power distribution','transformer','substation','feeder','switchyard','voltage level','earthing','grounding','ups','dg set','emergency power','load shedding','single line diagram'],
  'Control loops & tuning': ['control loop','pid','tuning','proportional','integral','derivative','setpoint','cascade','feedforward','controller','gain','oscillation','dead time','process variable'],
  'Safety instrumented systems (SIS/SIL)': ['sis','sil','safety instrumented','sif','interlock','trip','voting','2oo3','proof test','esd','logic solver','final element','pfd','lopa','hazop'],
  'Analyzers & metering': ['analyzer','metering','gc','gas chromatograph','oxygen analyzer','ph','conductivity','flow meter','custody transfer','orifice','coriolis','ultrasonic','calibration','sample conditioning','swas'],
};

const GENERIC = ['pressure','temperature','flow','level','valve','pump','compressor','exchanger','pipe','process'];

export function chunkText(text, chunkSize = 1200) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).length > chunkSize && current.length > 200) {
      chunks.push(current.trim());
      current = s;
    } else { current += ' ' + s; }
  }
  if (current.trim().length > 100) chunks.push(current.trim());
  return chunks;
}

function scoreChunk(chunk, topicLabel, keywords) {
  const lower = chunk.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    const matches = lower.split(kw.toLowerCase()).length - 1;
    if (matches > 0) score += matches * (kw.includes(' ') ? 3 : 2);
  }
  for (const w of topicLabel.toLowerCase().split(/[\s/&()]+/).filter(w => w.length > 3)) {
    const matches = lower.split(w).length - 1;
    if (matches > 0) score += matches * 2;
  }
  for (const g of GENERIC) { if (lower.includes(g)) score += 0.2; }
  return score;
}

// Weighted random sample — higher scores get higher probability but not guaranteed top-N
// This provides retrieval variety so the LLM sees different passages each call
function weightedSample(items, n) {
  if (items.length <= n) return items;
  const result = [];
  const pool = [...items];
  const totalScore = pool.reduce((s, i) => s + i.score + 1, 0);
  while (result.length < n && pool.length > 0) {
    let rand = Math.random() * pool.reduce((s, i) => s + i.score + 1, 0);
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i].score + 1;
      if (rand <= 0) { result.push(pool.splice(i, 1)[0]); break; }
    }
  }
  return result;
}

// userId param removed — all users share the same knowledge base (admin-managed)
export async function retrieveForTopic(topicLabel, { rotate = false, maxChars = 8000 } = {}) {
  const docs = await all('SELECT id, filename, chunks, text_content FROM pdfs');
  if (docs.length === 0) return { context: '', docsReferenced: [] };

  const keywords = TOPIC_KEYWORDS[topicLabel] || [];
  const scored = [];

  for (const doc of docs) {
    let chunks;
    try { chunks = JSON.parse(doc.chunks || 'null'); } catch { chunks = null; }
    if (!chunks) chunks = chunkText(doc.text_content || '');
    chunks.forEach((chunk, i) => {
      const score = scoreChunk(chunk, topicLabel, keywords);
      if (score > 0) scored.push({ docId: doc.id, filename: doc.filename, chunk, score, i });
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Retrieval rotation: sample from top 2x pool instead of always taking top-N
  // This ensures different passages surface on repeat calls for the same topic
  const needed = Math.ceil(maxChars / 1200);
  const pool = rotate ? scored.slice(0, needed * 2) : scored.slice(0, needed);
  const selected = rotate && pool.length > needed ? weightedSample(pool, needed) : pool;

  const docsUsed = new Map();
  let chars = 0;
  const final = [];
  for (const s of selected) {
    if (chars + s.chunk.length > maxChars) continue;
    final.push(s);
    docsUsed.set(s.docId, s.filename);
    chars += s.chunk.length;
  }

  // Fallback: nothing matched — sample evenly from all docs
  if (final.length === 0) {
    for (const doc of docs) {
      let chunks;
      try { chunks = JSON.parse(doc.chunks || 'null'); } catch { chunks = null; }
      if (!chunks) chunks = chunkText(doc.text_content || '');
      const step = Math.max(1, Math.floor(chunks.length / 3));
      for (let i = 0; i < chunks.length && chars < maxChars; i += step) {
        final.push({ docId: doc.id, filename: doc.filename, chunk: chunks[i] });
        docsUsed.set(doc.id, doc.filename);
        chars += chunks[i].length;
      }
    }
  }

  const context = final.map(s => `[Source: ${s.filename}]\n${s.chunk}`).join('\n\n');
  const docsReferenced = [...docsUsed.entries()].map(([id, filename]) => ({ id, filename }));
  return { context, docsReferenced };
}
