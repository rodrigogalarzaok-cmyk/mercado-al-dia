// Calendario económico: lo que se publica en los próximos días en EE.UU. y Argentina.
// Todo sale solo de fuentes oficiales que anuncian sus fechas con meses de anticipación:
//   EE.UU.: BLS (inflación, empleo), BEA (PBI, inflación PCE), la Fed (reuniones de tasa),
//           los pedidos de subsidio por desempleo (todos los jueves) y, para la semana en curso,
//           el calendario de ForexFactory (PMI, discursos del presidente de la Fed, etc.).
//   Argentina: el calendario de difusión del INDEC, día por día.
// Las horas se pasan a hora de Argentina. Si una fuente falla, se arma con las demás.

import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const DIAS = 45;   // de hoy a un mes y medio: el mes en curso y el que viene

async function traer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
const esperar = ms => new Promise(r => setTimeout(r, ms));

// ── Horarios ──
// '2026-11-10T08:30' en la zona de Nueva York → momento exacto (contempla el horario de verano).
function enZona(fechaHora, zona) {
  const aprox = new Date(fechaHora + 'Z');
  const verEn = z => new Date(aprox.toLocaleString('en-US', { timeZone: z }));
  return new Date(aprox.getTime() + (verEn('UTC') - verEn(zona)));
}
const NY = 'America/New_York';
function aArgentina(momento) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(momento).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const evento = (pais, momento, nombre) => ({ pais, ...aArgentina(momento), evento: nombre });

// ── EE.UU.: calendarios oficiales en formato .ics (BLS y BEA) ──
function leerIcs(texto) {
  return texto.replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1).map(e => {
    const inicio = e.match(/DTSTART[^:\n]*:(\d{8}T\d{4,6}Z?)/)?.[1];
    const titulo = (e.match(/SUMMARY:(.*)/)?.[1] || '').replace(/\\([,;\\])/g, '$1').trim();
    if (!inicio) return null;
    const fh = `${inicio.slice(0, 4)}-${inicio.slice(4, 6)}-${inicio.slice(6, 8)}T${inicio.slice(9, 11)}:${inicio.slice(11, 13)}`;
    return { momento: inicio.endsWith('Z') ? new Date(fh + 'Z') : enZona(fh, NY), titulo };
  }).filter(Boolean);
}

const BLS = [
  [/^Consumer Price Index/, 'Inflación (IPC)'],
  [/^Employment Situation/, 'Informe de empleo y desempleo'],
  [/^Producer Price Index/, 'Inflación mayorista (IPP)'],
  [/^Job Openings and Labor Turnover/, 'Ofertas de empleo (JOLTS)'],
  [/^Employment Cost Index/, 'Costo laboral'],
];
const BEA = [
  [/^GDP \(Advance/, 'PBI (primera estimación)'],
  [/^GDP \(Second/, 'PBI (segunda estimación)'],
  [/^GDP \(Third/, 'PBI (estimación final)'],
  [/^Personal Income and Outlays/, 'Inflación PCE, la que mira la Fed'],
  [/^U\.S\. International Trade in Goods and Services/, 'Balanza comercial'],
];
// Cada calendario que se baja bien queda guardado (cache-<nombre>.json). Si un día no se puede bajar
// (la BLS bloquea a las computadoras de GitHub), se usa el guardado: esas fechas se anuncian con meses de anticipación.
async function deIcs(url, tabla, nombre) {
  const archivo = new URL(`./cache-${nombre}.json`, import.meta.url);
  let texto;
  try {
    texto = await traer(url);
    if (!texto.includes('BEGIN:VEVENT')) throw new Error('no es un calendario');
    await writeFile(archivo, JSON.stringify({ pedido: Date.now(), texto }));
  } catch (e) {
    try { texto = JSON.parse(await readFile(archivo, 'utf8')).texto; console.warn(`Calendario: ${nombre} no respondió, uso el guardado`); }
    catch { throw e; }
  }
  return leerIcs(texto).flatMap(({ momento, titulo }) => {
    const t = tabla.find(([re]) => re.test(titulo));
    return t ? [evento('us', momento, t[1])] : [];
  });
}

// ── EE.UU.: reuniones de la Fed (el segundo día anuncian la tasa a las 14 y dan la conferencia a las 14:30 de NY) ──
const MESES_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
async function fed() {
  const html = await traer('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm');
  const partes = html.split(/(\d{4}) FOMC Meetings/);
  const lista = [];
  for (let i = 1; i < partes.length; i += 2) {
    const año = +partes[i];
    const re = /fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g;
    for (const [, mes, dias] of partes[i + 1].matchAll(re)) {
      const m = dias.match(/(\d+)\s*-\s*(\d+)/);
      if (!m) continue;   // reuniones sin fecha de dos días (ej. "notation vote")
      const meses = mes.toLowerCase().split('/');
      const mesFin = MESES_EN.findIndex(x => x.startsWith(meses.at(-1).trim().slice(0, 3))) + 1;
      if (!mesFin) continue;
      const dia = `${año}-${String(mesFin).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      lista.push(evento('us', enZona(`${dia}T14:00`, NY), 'Decisión de tasa de la Fed'));
      lista.push(evento('us', enZona(`${dia}T14:30`, NY), 'Conferencia de prensa de la Fed'));
    }
  }
  return lista;
}

// ── EE.UU.: pedidos de subsidio por desempleo, todos los jueves 8:30 de NY (si el jueves es feriado, el miércoles) ──
function subsidios(desde, hasta) {
  const lista = [];
  for (let d = new Date(desde); d <= hasta; d = new Date(d.getTime() + 864e5)) {
    if (d.getUTCDay() !== 4) continue;
    const [a, m, dia] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    const feriado = (m === 11 && dia >= 22 && dia <= 28) || (m === 12 && dia === 25) || (m === 1 && dia === 1) || (m === 7 && dia === 4);
    const real = new Date(d.getTime() - (feriado ? 864e5 : 0)).toISOString().slice(0, 10);
    lista.push(evento('us', enZona(`${real}T08:30`, NY), 'Pedidos de subsidio por desempleo'));
  }
  return lista;
}

// ── EE.UU.: semana en curso de ForexFactory (lo que no tiene calendario oficial propio) ──
const FF = [
  [/^ISM Manufacturing PMI$/, 'PMI manufacturero (ISM)'],
  [/^ISM Services PMI$/, 'PMI de servicios (ISM)'],
  [/^Flash Manufacturing PMI$/, 'PMI manufacturero (preliminar)'],
  [/^Flash Services PMI$/, 'PMI de servicios (preliminar)'],
  [/^Retail Sales m\/m$/, 'Ventas minoristas'],
  [/^Prelim UoM Consumer Sentiment$/, 'Confianza del consumidor (Michigan)'],
  [/^CB Consumer Confidence$/, 'Confianza del consumidor'],
  [/^FOMC Meeting Minutes$/, 'Minutas de la Fed'],
  [/^Fed Chair .*(Speaks|Testifies)/, 'Habla el presidente de la Fed'],
];
// ForexFactory frena a quien consulta seguido (error 429): se guarda en un archivo y se pide como mucho cada 6 horas.
// Si falla, se usa lo último guardado.
const ARCHIVO_FF = new URL('./cache-forexfactory.json', import.meta.url);
async function forexFactory() {
  let guardado = null;
  try { guardado = JSON.parse(await readFile(ARCHIVO_FF, 'utf8')); } catch {}
  let d = guardado?.datos;
  if (!guardado || Date.now() - guardado.pedido > 6 * 3600e3) {
    try {
      d = JSON.parse(await traer('https://nfs.faireconomy.media/ff_calendar_thisweek.json'));
      await writeFile(ARCHIVO_FF, JSON.stringify({ pedido: Date.now(), datos: d }));
    } catch (e) { if (!d) throw e; }
  }
  return d.filter(x => x.country === 'USD').flatMap(x => {
    const t = FF.find(([re]) => re.test(x.title));
    return t && /T\d\d:\d\d/.test(x.date) ? [evento('us', new Date(x.date), t[1])] : [];
  });
}

// ── Argentina: calendario de difusión del INDEC (se consulta día por día) ──
const INDEC = [
  [/^Índice de precios al consumidor/, 'Inflación (IPC)'],
  [/^Valorización mensual de la canasta básica alimentaria/, 'Canasta básica'],
  [/^Estimador mensual de actividad económica/, 'Actividad económica (EMAE)'],
  [/^Intercambio comercial argentino/, 'Balanza comercial'],
  [/^Índice de salarios/, 'Salarios'],
  [/^Índice de producción industrial manufacturero/, 'Producción industrial'],
  [/^Indicadores de coyuntura de la actividad de la construcción/, 'Actividad de la construcción'],
  [/^Sistema de índices de precios mayoristas/, 'Inflación mayorista'],
  [/^Mercado de trabajo/, 'Desempleo'],
  [/^Informe de avance del nivel de actividad/, 'PBI'],
  [/^Incidencia de la pobreza/, 'Pobreza e indigencia'],
  [/^Balanza de pagos/, 'Balanza de pagos'],
];
const MESES_ES = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)( de \d{4})?$/i;
// "… Octubre de 2026" → " de octubre";  "… Tercer trimestre de 2026" → " del tercer trimestre"
function periodo(titulo) {
  const p = titulo.split('. ').at(-1).trim();
  if (MESES_ES.test(p)) return ' de ' + p.split(' ')[0].toLowerCase();
  const t = p.match(/^(\S+ (trimestre|semestre))/i);
  return t ? ' del ' + t[1].toLowerCase() : '';
}
async function indecDia(fecha) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const html = await traer(`https://www.indec.gob.ar/Calendario/FiltrosCalendario/dia/${fecha}/es`);
      if (/No hay publicaciones/.test(html)) return [];
      if (/MAPA DEL SITIO/.test(html)) throw new Error('vino la página entera');   // a veces responde mal: se reintenta
      const textos = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '|')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&nbsp;/g, ' ')
        .split('|').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const lista = [];
      textos.forEach((t, i) => {
        const hora = textos[i + 1]?.match(/^(\d{1,2}):(\d{2})\s*hs$/i);
        const tipo = INDEC.find(([re]) => re.test(t));
        if (hora && tipo) lista.push({ pais: 'ar', fecha, hora: `${hora[1].padStart(2, '0')}:${hora[2]}`, evento: tipo[1] + periodo(t) });
      });
      return lista;
    } catch { await esperar(700 * (intento + 1)); }
  }
  throw new Error(`INDEC no respondió el ${fecha}`);
}
async function indec(fechas) {
  const lista = [];
  for (let i = 0; i < fechas.length; i += 5) {   // de a 5 para no saturar la página del INDEC
    const tanda = await Promise.allSettled(fechas.slice(i, i + 5).map(indecDia));
    for (const r of tanda) if (r.status === 'fulfilled') lista.push(...r.value); else console.warn(r.reason.message);
  }
  return lista;
}

export async function calendario() {
  const hoy = aArgentina(new Date()).fecha;
  const desde = new Date(hoy + 'T12:00:00Z');
  const hasta = new Date(desde.getTime() + DIAS * 864e5);
  const fechas = [...Array(DIAS + 1)].map((_, i) => new Date(desde.getTime() + i * 864e5).toISOString().slice(0, 10));
  const ultima = fechas.at(-1);

  const fuentes = {
    'BLS': () => deIcs('https://www.bls.gov/schedule/news_release/bls.ics', BLS, 'bls'),
    'BEA': () => deIcs('https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics', BEA, 'bea'),
    'Fed': fed,
    'ForexFactory': forexFactory,
    'INDEC': () => indec(fechas.filter(f => ![0, 6].includes(new Date(f + 'T12:00:00Z').getUTCDay()))),
  };
  const todos = [...subsidios(desde, hasta)];
  const resultados = await Promise.all(Object.entries(fuentes).map(([nombre, f]) =>
    f().catch(e => { console.warn(`Calendario: no respondió ${nombre}`, e.message); return []; })));
  for (const lista of resultados) todos.push(...lista);
  // Sin repetidos (ej. un PMI que trae ForexFactory y otra fuente), solo de hoy a un mes y medio, en orden.
  const vistos = new Set();
  return todos
    .filter(e => e.fecha >= hoy && e.fecha <= ultima)
    .filter(e => { const k = `${e.pais}|${e.fecha}|${e.evento}`; return !vistos.has(k) && vistos.add(k); })
    .sort((a, b) => (a.fecha + a.hora + a.pais).localeCompare(b.fecha + b.hora + b.pais));
}

// Para probarlo solo: node calendario.mjs
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const c = await calendario();
  for (const e of c) console.log(e.fecha, e.hora, e.pais === 'us' ? 'EE.UU.' : 'ARG   ', e.evento);
  console.log(c.length, 'eventos');
}
