// Junta noticias y precios de fuentes gratis, las ordena por importancia
// y deja todo en public/noticias.json para que lo muestre la página.
//
// Uso:  node armar.mjs
// Con la IA: pegar la clave de Groq en clave-groq.txt (o GROQ_API_KEY=... node armar.mjs)

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { calendario } from './calendario.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const HORAS_ATRAS = 48;   // las de más de 24 h solo sirven para completar una pestaña que quedó corta
const CANTIDAD = 10;   // noticias por pestaña (como máximo)
const MINIMO = 8;      // noticias por pestaña (como mínimo, si hay con qué: Marc, "con 4 no hacemos nada")
const PUNTAJE_MINIMO = 35;   // por debajo es relleno: mejor mostrar menos

// ───────────────────────── Fuentes ─────────────────────────

// Diarios cuyas notas se pueden mostrar (traen foto y link directo).
// ar: diario argentino (si no se reconoce la región, la nota va a Argentina).
// argentino: medio de Argentina. En EE.UU. y Mundo se prefieren los medios de afuera (pedido de Marc:
//   que no sea casi todo de diarios argentinos).
// general: no es un diario económico, solo entran sus notas de economía y mercados.
// en: está en otro idioma (inglés, francés, alemán o portugués); se traduce al español antes de puntuarla y mostrarla.
// conMedio: el título trae " - Medio" al final (Google Noticias) y se le saca.
// sinFoto: el medio no deja sacar la foto de sus notas (Bloomberg, Reuters). Sus notas sirven para medir
//   la importancia y agrupar, pero se muestra la versión de otro medio que tenga foto; si no hay, no entra.
const DIARIOS = [
  { fuente: 'Ámbito',          url: 'https://www.ambito.com/rss/pages/finanzas.xml', ar: true, argentino: true },
  { fuente: 'Ámbito',          url: 'https://www.ambito.com/rss/pages/economia.xml', ar: true, argentino: true },
  { fuente: 'Infobae',         url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/economia/', ar: true, argentino: true },
  { fuente: 'Infobae',         url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/estados-unidos/', general: true, argentino: true },
  { fuente: 'Infobae',         url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/america/mundo/', general: true, argentino: true },
  { fuente: 'Bloomberg Línea', url: 'https://www.bloomberglinea.com/arc/outboundfeeds/rss/category/mercados/?outputType=xml' },
  { fuente: 'Investing',       url: 'https://es.investing.com/rss/news.rss' },
  { fuente: 'Investing',       url: 'https://es.investing.com/rss/news_14.rss' },   // economía
  { fuente: 'Investing',       url: 'https://es.investing.com/rss/news_11.rss' },   // materias primas
  { fuente: 'Investing',       url: 'https://es.investing.com/rss/news_25.rss' },   // acciones
  { fuente: 'Investing',       url: 'https://es.investing.com/rss/news_95.rss' },   // indicadores
  { fuente: 'Expansión',       url: 'https://e00-expansion.uecdn.es/rss/mercados.xml' },
  { fuente: 'BBC Mundo',       url: 'https://feeds.bbci.co.uk/mundo/rss.xml', general: true },
  { fuente: 'DW',              url: 'https://rss.dw.com/xml/rss-sp-eco' },
  // Internacionales en inglés (se traducen).
  { fuente: 'Bloomberg',       url: 'https://feeds.bloomberg.com/markets/news.rss', en: true, sinFoto: true },
  { fuente: 'Bloomberg',       url: 'https://feeds.bloomberg.com/economics/news.rss', en: true, sinFoto: true },
  { fuente: 'CNBC',            url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', en: true, general: true },   // portada
  { fuente: 'CNBC',            url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', en: true },   // economía
  { fuente: 'CNBC',            url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html', en: true },   // mercados
  { fuente: 'MarketWatch',     url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', en: true, general: true },
  { fuente: 'CoinDesk',        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', en: true },   // bitcoin y cripto
  { fuente: 'Reuters',         url: 'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=' + encodeURIComponent('site:reuters.com (markets OR economy OR Fed OR oil OR inflation OR stocks) when:1d'), en: true, conMedio: true, sinFoto: true },
  // Más diarios argentinos.
  { fuente: 'La Nación',       url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/economia/?outputType=xml', ar: true, argentino: true },
  { fuente: 'Clarín',          url: 'https://www.clarin.com/rss/economia/', ar: true, argentino: true },
  { fuente: 'El Cronista',     url: 'https://www.cronista.com/files/rss/economia-politica.xml', ar: true, argentino: true },
  { fuente: 'iProfesional',    url: 'https://www.iprofesional.com/rss/finanzas', ar: true, argentino: true },
  { fuente: 'El Economista',   url: 'https://eleconomista.com.ar/feed/', ar: true, argentino: true },
  { fuente: 'Perfil',          url: 'https://www.perfil.com/feed/economia', ar: true, argentino: true },
  // EE.UU.
  { fuente: 'The Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', en: true },
  { fuente: 'Fortune',         url: 'https://fortune.com/feed/fortune-feeds/?id=3230629', en: true, general: true },
  { fuente: 'Cointelegraph',   url: 'https://cointelegraph.com/rss', en: true },
  // Europa.
  { fuente: 'Financial Times', url: 'https://www.ft.com/markets?format=rss', en: true },
  { fuente: 'The Economist',   url: 'https://www.economist.com/finance-and-economics/rss.xml', en: true },
  { fuente: 'The Guardian',    url: 'https://www.theguardian.com/business/rss', en: true, general: true },
  { fuente: 'BBC',             url: 'https://feeds.bbci.co.uk/news/business/rss.xml', en: true },
  { fuente: 'El País',         url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada' },
  { fuente: 'Les Echos',       url: 'https://services.lesechos.fr/rss/les-echos-finance-marches.xml', en: true },
  { fuente: 'Handelsblatt',    url: 'https://www.handelsblatt.com/contentexport/feed/finanzen', en: true },
  // RT y TASS son medios del gobierno ruso: suman para medir de qué se habla, pero nunca se muestra su versión
  // (reglamento editorial: la fiabilidad es requisito de admisión).
  { fuente: 'RT en Español',   url: 'https://actualidad.rt.com/feeds/all.rss', general: true, sinFoto: true },
  { fuente: 'TASS',            url: 'https://tass.com/rss/v2.xml', en: true, general: true, sinFoto: true },
  // América.
  { fuente: 'The Globe and Mail', url: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/business/', en: true },
  { fuente: 'Financial Post',  url: 'https://financialpost.com/feed/', en: true },
  { fuente: 'El País Uruguay', url: 'https://www.elpais.com.uy/rss/negocios' },
  { fuente: 'Valor Econômico', url: 'https://valor.globo.com/rss/valor', en: true },
  { fuente: 'InfoMoney',       url: 'https://www.infomoney.com.br/feed/', en: true },
  { fuente: 'El Financiero',   url: 'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml', general: true },
  // Asia y Medio Oriente.
  { fuente: 'South China Morning Post', url: 'https://www.scmp.com/rss/92/feed', en: true },
  { fuente: 'Nikkei Asia',     url: 'https://asia.nikkei.com/rss/feed/nar', en: true },
  { fuente: 'Al Jazeera',      url: 'https://www.aljazeera.com/xml/rss/all.xml', en: true, general: true },
];

// Para la pestaña "Fuentes" de la página: de qué país es cada medio y su página principal.
// Solo figuran los medios que de verdad se leen (los de DIARIOS).
const MEDIOS = {
  'Ámbito': ['Argentina', 'https://www.ambito.com'], 'Infobae': ['Argentina', 'https://www.infobae.com'],
  'La Nación': ['Argentina', 'https://www.lanacion.com.ar'], 'Clarín': ['Argentina', 'https://www.clarin.com'],
  'El Cronista': ['Argentina', 'https://www.cronista.com'], 'iProfesional': ['Argentina', 'https://www.iprofesional.com'],
  'El Economista': ['Argentina', 'https://eleconomista.com.ar'], 'Perfil': ['Argentina', 'https://www.perfil.com'],
  'Bloomberg': ['Estados Unidos', 'https://www.bloomberg.com'], 'Bloomberg Línea': ['Estados Unidos', 'https://www.bloomberglinea.com'],
  'CNBC': ['Estados Unidos', 'https://www.cnbc.com'], 'The Wall Street Journal': ['Estados Unidos', 'https://www.wsj.com'],
  'MarketWatch': ['Estados Unidos', 'https://www.marketwatch.com'], 'Reuters': ['Internacional', 'https://www.reuters.com'],
  'Investing': ['Internacional', 'https://es.investing.com'], 'Fortune': ['Estados Unidos', 'https://fortune.com'],
  'CoinDesk': ['Estados Unidos', 'https://www.coindesk.com'], 'Cointelegraph': ['Internacional', 'https://cointelegraph.com'],
  'Financial Times': ['Reino Unido', 'https://www.ft.com'], 'The Economist': ['Reino Unido', 'https://www.economist.com'],
  'The Guardian': ['Reino Unido', 'https://www.theguardian.com/business'], 'BBC': ['Reino Unido', 'https://www.bbc.com/business'],
  'BBC Mundo': ['Reino Unido', 'https://www.bbc.com/mundo'], 'El País': ['España', 'https://elpais.com/economia'],
  'Expansión': ['España', 'https://www.expansion.com'], 'Les Echos': ['Francia', 'https://www.lesechos.fr'],
  'Handelsblatt': ['Alemania', 'https://www.handelsblatt.com'], 'DW': ['Alemania', 'https://www.dw.com/es'],
  'RT en Español': ['Rusia', 'https://actualidad.rt.com'], 'TASS': ['Rusia', 'https://tass.com'],
  'The Globe and Mail': ['Canadá', 'https://www.theglobeandmail.com/business'], 'Financial Post': ['Canadá', 'https://financialpost.com'],
  'El País Uruguay': ['Uruguay', 'https://www.elpais.com.uy'], 'Valor Econômico': ['Brasil', 'https://valor.globo.com'],
  'InfoMoney': ['Brasil', 'https://www.infomoney.com.br'], 'El Financiero': ['México', 'https://www.elfinanciero.com.mx'],
  'South China Morning Post': ['Hong Kong', 'https://www.scmp.com'], 'Nikkei Asia': ['Japón', 'https://asia.nikkei.com'],
  'Al Jazeera': ['Qatar', 'https://www.aljazeera.com'],
};

// Búsquedas de Google Noticias: no se muestran, sirven para contar
// cuántos medios hablan de cada tema (la mejor señal de importancia).
const GOOGLE = [
  'mercados OR "wall street" OR acciones',
  'tasas OR "reserva federal" OR "banco central" OR inflación',
  'petróleo OR oro OR dólar OR "riesgo país"',
  'merval OR bonos OR BCRA',
  'China OR Japón OR Brasil OR Rusia economía',
  'Trump OR Fed OR "Estados Unidos" economía',
  'elecciones OR Lula OR Bolsonaro OR candidato',
].map(q => 'https://news.google.com/rss/search?hl=es-419&gl=AR&ceid=AR:es-419&q=' + encodeURIComponent(q + ' when:1d'));

// ───────────────────────── Reglas de importancia ─────────────────────────
// Cada tema tiene un nivel: 1 es lo que mueve a todo el mercado,
// 4 es una empresa sola. Marc: "esto es bolsa, donde se gana dinero". Prioridad: tasas, inflación,
// empleo, índices (S&P, Merval), bonos, riesgo país, petróleo, guerras, elecciones y bitcoin. Las palabras se buscan sin tildes y en minúscula.

const TEMAS = [
  { tag: 'Tasas',      nivel: 1, palabras: [' tasa de interes', ' tasas de interes', ' tipos de interes', ' tipos ', ' reserva federal', ' fed ', 'powell', 'recorte de tasas', 'suba de tasas', 'politica monetaria', 'bce', 'lagarde'] },
  { tag: 'Inflación',  nivel: 1, palabras: ['inflacion', ' ipc', 'indice de precios', 'deflacion'] },
  { tag: 'Empleo',     nivel: 1, palabras: ['desempleo', ' empleo ', 'nominas', 'mercado laboral', 'payrolls'] },
  { tag: 'Economía',   nivel: 1, palabras: [' pbi', ' pib', 'recesion', 'default', ' fmi', 'fondo monetario', 'crisis'] },
  { tag: 'Comercio',   nivel: 1, palabras: ['aranceles', 'arancel', 'guerra comercial'] },
  { tag: 'BCRA',       nivel: 1, palabras: ['bcra', 'banco central', 'reservas'] },
  { tag: 'Petróleo',   nivel: 1, palabras: ['petroleo', 'brent', ' wti', 'crudo', 'opep'] },
  { tag: 'Oro',        nivel: 2, palabras: [' oro ', ' plata ', ' metales '] },
  { tag: 'Dólar',      nivel: 2, palabras: [' dolar ', ' tipo de cambio', ' cambiario', ' brecha '] },
  { tag: 'Riesgo país',nivel: 1, palabras: ['riesgo pais'] },
  { tag: 'Bonos',      nivel: 1, palabras: ['bonos', 'treasury', 'tesoro', 'licitacion', 'deuda'] },
  { tag: 'Índices',    nivel: 1, palabras: ['wall street', 's&p', 'nasdaq', 'dow jones', 'merval', 'bolsas', 'nikkei', 'bovespa', 'stoxx', ' dax ', 'hang seng'] },
  { tag: 'Materias primas', nivel: 2, palabras: [' cobre ', ' soja ', ' trigo ', ' maiz ', ' litio ', ' gas natural ', ' materias primas ', ' commodities '] },
  { tag: 'Geopolítica',nivel: 1, palabras: [' guerra ', ' sanciones ', ' ormuz ', ' misil', ' conflicto ', ' ataque', ' bombarde'] },
  { tag: 'Elecciones', nivel: 1, palabras: [' elecciones ', ' electoral ', ' comicios ', ' balotaje ', ' segunda vuelta ', ' primera vuelta ', ' candidatura', ' candidato', ' campana electoral', ' bolsonaro', ' tarcisio'] },
  { tag: 'Cripto',     nivel: 1, palabras: ['bitcoin', 'cripto', 'ethereum'] },
  { tag: 'Acciones',   nivel: 2, palabras: [' acciones ', ' adr', ' cedear', ' bancos ', ' tecnologicas', ' energeticas', ' sector '] },
];

// Empresas argentinas que cotizan (panel líder y las más seguidas): una noticia de ellas es de bolsa.
const EMPRESAS_AR = [' ypf', ' pampa', ' galicia', ' banco macro', ' bbva', ' supervielle', ' tgs', ' transportadora de gas', ' telecom', ' vista ', ' vista energy', ' mercadolibre', ' mercado libre', ' globant', ' loma negra', ' aluar', ' ternium', ' central puerto', ' edenor', ' transener', ' cresud', ' irsa', ' byma', ' tgn', ' metrogas', ' ecogas', ' despegar', ' bioceres', ' corporacion america', ' tenaris', ' arcor', ' molinos'];

// Empresas gigantes: si se mueven, mueven al índice entero.
const GIGANTES = ['apple', 'microsoft', 'nvidia', 'amazon', 'alphabet', 'google', 'meta', 'tesla', 'berkshire', 'broadcom', 'jpmorgan', 'exxon', 'tsmc', 'ypf', 'galicia', 'mercadolibre', 'vista'];

// Regiones: cada nota va a la pestaña cuyas palabras aparezcan más
// (las del título valen 10 veces más). Empate: Argentina, después EE.UU.
const REGIONES = {
  argentina: [' argentin', ' bcra ', ' merval ', ' riesgo pais ', ' caputo ', ' milei ', ' ypf ', ' galicia ', ' blue ', ' mep ', ' ccl ', ' lecap', ' cedear', ' indec ', ' buenos aires ', ' kicillof ', ' vaca muerta ', ' rigi ', ' bonares ', ' globales ', ' pymes '],
  eeuu: [' estados unidos ', ' eeuu ', ' ee uu ', ' wall street ', ' fed ', ' reserva federal ', ' powell ', ' s&p', ' nasdaq ', ' dow jones ', ' trump ', ' washington ', ' nueva york ', ' casa blanca ', ' treasury', ' apple ', ' microsoft ', ' nvidia ', ' amazon ', ' alphabet ', ' google ', ' meta ', ' tesla ', ' netflix ', ' jpmorgan ', ' goldman ', ' berkshire ', ' broadcom ', ' boeing ', ' intel ', ' openai ', ' estadounidense'],
  mundo: [' china ', ' chin', ' pekin ', ' japon', ' brasil', ' rusia', ' rus', ' india ', ' europa ', ' europe', ' eurozona ', ' bce ', ' alemania ', ' reino unido ', ' francia ', ' opep', ' ormuz ', ' medio oriente ', ' iran ', ' israel ', ' ucrania ', ' arabia saudi', ' petroleo ', ' brent ', ' wti ', ' crudo ', ' oro ', ' cobre ', ' plata ', ' materias primas ', ' commodities ', ' bitcoin ', ' cripto', ' nikkei ', ' bovespa ', ' ibovespa ', ' lula ', ' bolsonaro', ' tarcisio', ' haddad', ' real brasileno', ' xi jinping ', ' putin ', ' corea ', ' taiwan ', ' yen ', ' yuan ', ' euro '],
};
// España (y sus empresas) y el resto de Latinoamérica no van a ninguna pestaña.
const AFUERA = [' ibex ', ' espana ', ' espanol', ' sanchez ', ' cnmv ', ' madrid ', ' redeia ', ' iberdrola ', ' santander ', ' telefonica ', ' repsol ', ' inditex ', ' bbva ', ' colombia', ' peru ', ' chile', ' mexic', ' ecuador', ' venezuela', ' bolivia', ' uruguay', ' paraguay'];

function region(titulo, texto, diario) {
  const cuenta = lista => lista.reduce((t, p) => t + (titulo.includes(p) ? 10 : texto.includes(p) ? 1 : 0), 0);
  const puntos = Object.fromEntries(Object.entries(REGIONES).map(([r, lista]) => [r, cuenta(lista)]));
  if (diario.ar) puntos.argentina += 5;   // diario argentino: medio punto de título
  const [mejor, max] = Object.entries(puntos).sort((a, b) => b[1] - a[1])[0];
  // Diarios de afuera: la región tiene que estar en el título. Argentinos: alcanza con el texto.
  if (max < (diario.ar ? 6 : 10) || AFUERA.some(p => titulo.includes(p)) || cuenta(AFUERA) >= max) return null;
  return mejor;
}

// Lo que se habla en la bolsa: si está en el título, la nota sube.
const DE_BOLSA = [' bolsa', ' acciones', ' accion ', ' merval', ' s&p', ' wall street', ' nasdaq', ' dow ', ' bonos', ' riesgo pais', ' rendimiento', ' tasa ', ' tasas', ' tipos de interes', ' fed ', ' reserva federal', ' bitcoin', ' cripto', ' adr', ' cedear', ' inversor', ' inversion', ' invertir', ' mercados', ' cotiza', ' petroleo', ' oro ', ' bcra', ' licitacion', ' lecap', ' ibovespa', ' indice', ' resultados trimestrales', ' balance trimestral', ' ganancias de ', ' dividend', ' ipo ', ' salida a bolsa'];
// Economía del bolsillo, política y tribunales: bajan mucho, salvo que el título también hable de la bolsa (entonces baja la mitad).
const NO_INVERSION = [' salari', ' sueldo', ' jubil', ' impuesto', ' paritari', ' pobreza', ' indigencia', ' alquiler', ' hipotecari', ' creditos ', ' prestamo', ' plazo fijo', ' tarjeta', ' investiga', ' denuncia', ' imputa', ' justicia', ' tribunal', ' fiscal ', ' causa ', ' diputados', ' senado', ' congreso', ' oposicion', ' gobernador', ' intendente', ' escandalo', ' empleo registrado', ' consumo masivo', ' supermercado', ' kicillof', ' cristina', ' kirchner', ' macri', ' massa', ' bullrich', ' villarruel', ' peronismo', ' libertarios', ' oficialismo', ' gabinete', ' ministro del interior'];

// Notas que no son de mercado (servicios, consumo, policiales): no entran.
const RUIDO = ['jubilad', 'anses', 'cuanto cobra', 'aguinaldo', ' auh', 'calendario de pago', 'receta', 'sorteo', 'quiniela', 'promocion', 'descuento', 'ofertas', ' vende ', 'director ejecutivo', 'vicepresidente', 'directivo', ' real blue', 'adquiere acciones', 'colectivo', 'tarifa', 'horoscopo', 'cuota alimentaria', 'paritaria', 'monotributo', 'hot sale', 'cyber monday', 'que se sabe', 'prepaga', ' drogas ', 'fentanilo', ' narco', ' crimen', ' asesin', ' tiroteo', ' policia', ' juicio ', ' jueza ', ' juez ', ' desvincul', ' despid', ' morosos', 'asesoramiento gratuito', 'dia de negociacion', 'banco por banco', 'cual es la tasa', 'este es el precio', 'cotizacion de hoy', 'a cuanto cotiza', 'precio del oro hoy', 'delivery', 'encuesta electoral', 'encuestas electorales', 'ultima encuesta', 'sondeo electoral', 'intencion de voto', 'encuesta que', 'encuestador', 'midieron a', 'imagen positiva', 'imagen negativa', 'quien gana', 'quien ganaria'];

// ───────────────────────── Utilidades ─────────────────────────

async function traer(url, { json = false, timeout = 15000, ...opc } = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opc.headers || {}) }, signal: AbortSignal.timeout(timeout), ...opc });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return json ? r.json() : r.text();
}

const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Texto listo para buscar palabras enteras: ' la fed sube la tasa '.
const paraBuscar = s => ' ' + sinTildes(s).replace(/[^a-z0-9&ñ]+/g, ' ') + ' ';

function limpiar(s = '') {
  return s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\s+/g, ' ').trim();
}

function campo(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
}

// Una foto de verdad: ni el logo de Google Noticias ni el logo del diario.
const fotoValida = url => !!url && /^https?:\/\//.test(url) && !/googleusercontent|gstatic|google\.com|logo|placeholder|default-image|favicon/i.test(url);

function leerRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const imagen =
      it.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] ||
      it.match(/<media:content[^>]+url="([^"]+)"/)?.[1] ||
      it.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] ||
      campo(it, 'content:encoded').match(/<img[^>]+src="([^"]+)"/)?.[1] || '';
    return {
      titulo: limpiar(campo(it, 'title')),
      link: limpiar(campo(it, 'link')),
      resumen: limpiar(campo(it, 'description')),
      fecha: new Date(limpiar(campo(it, 'pubDate') || campo(it, 'dc:date'))),
      fuenteGoogle: limpiar(campo(it, 'source')),
      imagen: fotoValida(imagen) ? imagen.replace(/&amp;/g, '&') : '',
    };
  });
}

const VACIAS = new Set('el la los las un una unos unas de del al a y o u e en por para con sin sobre que se su sus es son lo como mas menos ante tras hoy este esta estos estas ya no si fue ser hay entre desde hasta cual cuales'.split(' '));
const palabras = t => new Set(sinTildes(t).replace(/[^a-z0-9ñ ]/g, ' ').split(' ').filter(p => p.length > 2 && !VACIAS.has(p)).map(p => p.slice(0, 5)));   // 'compras' y 'compró' cuentan igual

function parecido(a, b) {
  let comun = 0;
  for (const p of a) if (b.has(p)) comun++;
  return comun / Math.min(a.size, b.size || 1);
}

// Traductor gratis de Google (sin clave). Se mandan varios textos juntos separados por salto de línea.
// Si una tanda falla, esos textos quedan en null y la nota no se usa (nada en otro idioma en la página).
// Google frena a quien traduce mucho seguido (error 429): por eso cada texto se traduce una sola vez y
// se guarda en un archivo (se borra lo de más de 3 días), y entre tanda y tanda hay una pausa.
const ARCHIVO_TRADUCCIONES = new URL('./cache-traducciones.json', import.meta.url);
let memoria = null;
async function leerMemoria() {
  if (memoria) return memoria;
  try { memoria = JSON.parse(await readFile(ARCHIVO_TRADUCCIONES, 'utf8')); } catch { memoria = {}; }
  const limite = Date.now() - 3 * 864e5;
  for (const k of Object.keys(memoria)) if (memoria[k][1] < limite) delete memoria[k];
  return memoria;
}
const guardarMemoria = () => memoria && writeFile(ARCHIVO_TRADUCCIONES, JSON.stringify(memoria));

async function traducir(textosOriginales, porTanda) {
  const mem = await leerMemoria();
  const textos = textosOriginales.map(t => (t || '').replace(/\s+/g, ' ').trim() || '.');
  const salida = textos.map(t => mem[t]?.[0] ?? null);
  const faltan = [...new Set(textos.filter((t, i) => salida[i] == null))];
  let frenado = false;
  for (let i = 0; i < faltan.length && !frenado; i += porTanda) {
    const tanda = faltan.slice(i, i + porTanda);
    if (i) await new Promise(res => setTimeout(res, 400));
    try {
      const d = await traer('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t', {
        json: true, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'q=' + encodeURIComponent(tanda.join('\n')),
      });
      const lineas = d[0].map(x => x[0]).join('').split('\n');
      if (lineas.length === tanda.length) lineas.forEach((l, j) => { mem[tanda[j]] = [l.trim(), Date.now()]; });
    } catch (e) { if (/429/.test(e.message)) { frenado = true; console.warn('El traductor frenó los pedidos (429): se usa lo ya traducido'); } }
  }
  await guardarMemoria();
  return textos.map((t, i) => salida[i] ?? mem[t]?.[0] ?? null);
}

// De los medios generales en otro idioma solo se traducen los títulos que hablan de economía o mercados.
const DE_MERCADO = /\b(fed|federal reserve|rates?|inflation|cpi|jobs|payrolls|gdp|recession|tariffs?|trade war|oil|crude|opec|gold|silver|bitcoin|crypto|stocks?|shares|markets?|wall street|s&p|nasdaq|dow|bonds?|treasur|yields?|dollar|currency|economy|economic|central bank|ecb|earnings|sanctions|war|attack|missile|china|taxes|debt|default|imf|bank|banco|mercad|bolsa|economi|inflaç|juros|petróleo|börse|zinsen|wirtschaft|marchés|bourse|inflation|économie)/i;

async function traducirNotas(notas) {
  notas = notas.filter(n => !(n.diario.en && n.diario.general && !DE_MERCADO.test(n.titulo)));
  const ajenas = notas.filter(n => n.diario.en);
  if (!ajenas.length) return notas;
  const titulos = await traducir(ajenas.map(n => n.titulo), 25);
  ajenas.forEach((n, i) => { n.tituloOriginal = n.titulo; n.titulo = titulos[i]; n.resumenOriginal = n.resumen; n.resumen = ''; });
  return notas.filter(n => n.titulo);
}

// Resumen en español de las notas en otro idioma que quedaron como candidatas.
async function traducirResumenes(candidatas) {
  const ajenas = candidatas.filter(n => n.resumenOriginal);
  const resumenes = await traducir(ajenas.map(n => recortar(n.resumenOriginal, 280)), 10);
  ajenas.forEach((n, i) => { n.resumen = resumenes[i] ? recortar(resumenes[i], 220) : ''; });
}

// ───────────────────────── Noticias ─────────────────────────

async function juntarNoticias() {
  const desde = Date.now() - HORAS_ATRAS * 3600e3;

  const diarios = (await Promise.allSettled(DIARIOS.map(async d =>
    leerRss(await traer(d.url).catch(() => traer(d.url))).map(n => ({ ...n, fuente: d.fuente, diario: d }))
  ))).flatMap((r, i) => r.status === 'fulfilled' ? r.value : (console.warn('No respondió', DIARIOS[i].url), []));

  const google = (await Promise.allSettled(GOOGLE.map(async u => leerRss(await traer(u)))))
    .flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // Notas recientes, sin repetir el mismo link.
  const vistos = new Set();
  let notas = diarios.filter(n => n.titulo && n.link && +n.fecha > desde && !vistos.has(n.link) && vistos.add(n.link));
  for (const n of notas) if (n.diario.conMedio) n.titulo = n.titulo.replace(/ - [^-]+$/, '');
  notas = await traducirNotas(notas);
  notas.forEach(n => { n.pal = palabras(n.titulo + ' ' + n.resumen.slice(0, 200)); n.palTit = palabras(n.titulo); });

  // Agrupar las notas que hablan de lo mismo.
  const grupos = [];
  for (const n of notas) {
    const g = grupos.find(g => g.some(x => parecido(x.palTit, n.palTit) >= 0.45 || parecido(x.pal, n.pal) >= 0.5));
    g ? g.push(n) : grupos.push([n]);
  }

  // Titulares de Google por medio, para medir cobertura.
  const titularesGoogle = google
    .filter(n => +n.fecha > desde)
    .map(n => ({ pal: palabras(n.titulo.replace(/ - [^-]+$/, '')), medio: n.fuenteGoogle || n.titulo.split(' - ').pop() }));

  return grupos.map(g => puntuar(g, titularesGoogle)).filter(Boolean);
}

function puntuar(grupo, titularesGoogle) {
  // La nota que se muestra: la que tenga foto y el texto más completo.
  const principal = [...grupo].sort((a, b) => (!!b.imagen - !!a.imagen) || (b.resumen.length - a.resumen.length))[0];
  const texto = paraBuscar(grupo.map(n => n.titulo + ' ' + n.resumen.slice(0, 300)).join(' '));
  const titulo = paraBuscar(principal.titulo);

  // 1. Tema (lo que más pesa). Lo que está en el título cuenta doble.
  let mejor = null;
  for (const t of TEMAS) {
    const enTitulo = t.palabras.some(p => titulo.includes(p));
    const enTexto = enTitulo || t.palabras.some(p => texto.includes(p));
    if (!enTexto) continue;
    const peso = (5 - t.nivel) * (enTitulo ? 10 : 3);
    if (!mejor || peso > mejor.peso) mejor = { ...t, peso };
  }
  // Diarios generales (BBC, Infobae Mundo): solo notas con un tema de mercado en el título.
  if (grupo.every(n => n.diario.general) && !(mejor && TEMAS.find(t => t.tag === mejor.tag).palabras.some(p => titulo.includes(p)))) return null;
  const tema = mejor || { tag: 'Empresas', nivel: 4, peso: 4 };

  let reg = region(titulo, texto, principal.diario);
  if (!reg) return null;
  // Bitcoin y cripto van siempre a Mundo (salvo que la nota sea de Argentina), así no se repiten en EE.UU.
  if (tema.tag === 'Cripto' && reg === 'eeuu') reg = 'mundo';
  // Qué versión se muestra: nunca una de un medio sin foto (Bloomberg, Reuters); primero las que ya traen
  // foto y, en EE.UU. y Mundo, primero los medios de afuera. Si no queda ninguna, la historia no entra.
  const mostrables = grupo.filter(n => !n.diario.sinFoto && [reg, tema.tag === 'Cripto' ? 'eeuu' : reg].includes(region(paraBuscar(n.titulo), texto, n.diario)) && !RUIDO.some(p => paraBuscar(n.titulo).includes(p)));
  if (!mostrables.length) return null;
  const afuera = n => reg !== 'argentina' && !n.diario.argentino;
  const mostrar = [...mostrables].sort((a, b) => (!!b.imagen - !!a.imagen) || (afuera(b) - afuera(a)) || (b.resumen.length - a.resumen.length))[0];
  // Y si solo la cuentan diarios argentinos, baja un poco (no es que no entre: baja).
  const soloArgentinos = reg !== 'argentina' && grupo.every(n => n.diario.argentino) ? 8 : 0;

  // 2. Cuántos medios hablan de lo mismo (cobertura).
  const medios = new Set(grupo.map(n => n.fuente));
  for (const g of titularesGoogle) if (parecido(principal.palTit, g.pal) >= 0.5) medios.add(g.medio);
  const cobertura = Math.log2(medios.size + 1) * 8;

  // 3. Empresas gigantes.
  const gigante = GIGANTES.some(p => titulo.includes(p)) ? 6 : 0;

  // 4. Frescura.
  if (RUIDO.some(p => titulo.includes(p))) return null;
  const horas = (Date.now() - Math.max(...grupo.map(n => +n.fecha))) / 3600e3;
  const frescura = Math.max(0, 8 - horas / 3);
  const edad = horas;   // para la selección final

  // 5. Bolsa sí, bolsillo y política no.
  const tituloMostrar = paraBuscar(mostrar.titulo);
  const empresaAr = EMPRESAS_AR.some(p => titulo.includes(p) || tituloMostrar.includes(p));
  const deBolsa = empresaAr || DE_BOLSA.some(p => titulo.includes(p) || tituloMostrar.includes(p));
  const delBolsillo = NO_INVERSION.some(p => titulo.includes(p) || tituloMostrar.includes(p));
  const bolsa = deBolsa && !delBolsillo ? 8 : 0;
  // Si mezcla las dos (ej. "oro del Banco Central: investigan a…") baja la mitad.
  // Elecciones sin ángulo de mercado son política: se castigan igual que la política.
  const politicaElectoral = tema.tag === 'Elecciones' && !deBolsa;
  const noInversion = delBolsillo || politicaElectoral ? (deBolsa ? 12 : 25) : 0;
  // Una noticia de una empresa argentina que cotiza vale como un tema de primer nivel (ej. "Galicia puede subir 97%, según Morgan Stanley").
  const empresa = empresaAr ? 12 + Math.max(0, 30 - tema.peso) : 0;
  // Sin ningún tema de mercado en el título (ej. "Nueva York instala cámaras en los cruces"): baja.
  const temaEnTitulo = TEMAS.some(t => t.palabras.some(p => titulo.includes(p) || tituloMostrar.includes(p)));
  const sinTema = !temaEnTitulo && !deBolsa ? 15 : 0;

  // Elecciones con ángulo de mercado (ej. "el Ibovespa cae tras…", "los CEDEAR brasileños, gane quien gane"): suben.
  const elecciones = tema.tag === 'Elecciones' && deBolsa ? 10 : 0;

  const puntaje = Math.round(tema.peso + cobertura + gigante + frescura + bolsa + elecciones + empresa - soloArgentinos - noInversion - sinTema);

  return {
    titulo: mostrar.titulo,
    resumen: recortar(mostrar.resumen, 220),
    resumenOriginal: mostrar.resumenOriginal,
    tituloOriginal: mostrar.tituloOriginal,
    link: mostrar.link,
    fuente: mostrar.fuente,
    imagen: mostrar.imagen,
    fecha: new Date(Math.max(...grupo.map(n => +n.fecha))).toISOString(),
    region: reg,
    tag: tema.tag,
    nivel: tema.nivel,
    medios: medios.size,
    puntaje,
    horas: Math.round(edad),
    pal: [...principal.pal],
    detalle: { tema: tema.peso, cobertura: Math.round(cobertura), gigante, frescura: Math.round(frescura), soloArgentinos, bolsa, elecciones, empresa, noInversion, sinTema },
  };
}

function recortar(s, max) {
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  return corte.slice(0, corte.lastIndexOf(' ')) + '…';
}

// Foto de la nota cuando el diario no la manda en el RSS.
async function buscarFoto(link) {
  try {
    const html = await traer(link, { timeout: 8000 });
    const foto = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || '';
    return fotoValida(foto) ? foto.replace(/&amp;/g, '&') : '';
  } catch { return ''; }
}

// ───────────────────────── IA: Groq como editor ─────────────────────────
// Groq (con Q) lee las candidatas de cada pestaña y, para cada una, devuelve una nota del 1 al 10
// (cuánto mueve a la bolsa), un título en buen español y un resumen propio. Las reglas siguen
// mandando en lo que nunca entra (encuestas, relleno); la IA ordena y filtra el resto.
// Sin clave, o si Groq no responde, la página se arma igual solo con las reglas.

// La clave la pega Marc en clave-groq.txt (fuera de public/: nunca se publica) o va en GROQ_API_KEY.
async function claveGroq() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY.trim();
  try { return (await readFile(new URL('./clave-groq.txt', import.meta.url), 'utf8')).match(/gsk_[A-Za-z0-9]+/)?.[0] || ''; }
  catch { return ''; }
}

// Cada noticia se le manda a Groq una sola vez (se guarda la respuesta 3 días): no se gasta el límite gratis
// y una nota no cambia de lugar de una actualización a otra porque la IA opinó distinto.
const ARCHIVO_IA = new URL('./cache-ia.json', import.meta.url);
const MODELOS = [process.env.GROQ_MODELO, 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'].filter(Boolean);

// Reglamento editorial de Marc (2026-10-22), adaptado: Groq solo ve título y resumen de cada nota.
const CRITERIO = `Sos el editor de "Mercado al día", un diario online de BOLSA, mercados e inversiones para argentinos que invierten. No sos un agregador de noticias políticas. Tu tarea: puntuar cada noticia según su relevancia REAL para los mercados, es decir, si puede mover precios de activos, expectativas de inversión, tasas, inflación, crecimiento, ganancias de empresas, condiciones financieras o la percepción de riesgo.

ANTES DE PUNTUAR, preguntate: qué activo, empresa, sector o mercado se ve afectado; por qué mecanismo concreto; si es nuevo y material; si cambia lo que el mercado esperaba o solo confirma lo conocido. Si no podés identificar una consecuencia financiera concreta, la noticia vale menos de 30 (no se publica). Popularidad, polémica política, cantidad de medios que la cubren o sensacionalismo NO son relevancia financiera.

PUNTAJE de 0 a 100, ponderando: 35% impacto potencial en los activos; 25% sorpresa frente a lo que esperaba el mercado; 20% alcance (cuántos mercados afecta); 10% magnitud y duración del efecto; 10% confirmación. Escala: 85-100 crítica; 70-84 alta; 50-69 media; 30-49 baja (no se publica); 0-29 irrelevante. No es mecánico: un hecho sistémico, una decisión monetaria inesperada o una crisis de suministro global puede ir directo arriba. No subas una categoría entera por encima de las demás: evaluá cada hecho por su impacto.

QUÉ BUSCAR EN CADA PESTAÑA (son criterios, no cupos):
- eeuu: Fed, tasas y liquidez; inflación, empleo, PBI, consumo; bonos del Tesoro, rendimientos, deuda y VIX; S&P 500, Nasdaq, Dow Jones; resultados de empresas, previsiones, fusiones, quiebras; IA, semiconductores, centros de datos; aranceles, impuestos y regulación con efecto económico material.
- argentina: BCRA, tasas y régimen monetario; riesgo país, bonos, deuda, licitaciones y vencimientos; dólar oficial, MEP, CCL y blue cuando hay cambios relevantes; reservas y flujos de divisas; inflación, actividad, empleo y resultado fiscal; acciones, ADR y balances de empresas que cotizan (YPF, Pampa, Galicia…); energía, Vaca Muerta, agro, minería, exportaciones; reformas, impuestos y tarifas que cambien flujos de caja, inversión o riesgo soberano.
- mundo: guerras, sanciones y conflictos que afecten mercados o suministros; petróleo, gas, oro, metales y granos; BCE, Banco de Japón, Banco de Inglaterra, Banco Popular de China; inflación, deuda y crisis financieras; bolsas y empresas internacionales; aranceles, cadenas de suministro, restricciones tecnológicas; bitcoin y cripto solo con impacto financiero material.

GEOPOLÍTICA: ataques, amenazas de ataque, bloqueos o escaladas militares que involucren a Irán, el estrecho de Ormuz, el Golfo, Rusia-Ucrania, China-Taiwán u otras zonas que afecten petróleo, gas, rutas comerciales o la aversión al riesgo valen 70 o más, aunque la nota sea una declaración (por ejemplo, "Trump insinúa nuevos ataques a Irán").

POLÍTICA: peleas entre funcionarios, internas, polémicas, insultos, encuestas, candidatos y declaraciones sin cambio económico concreto valen menos de 30. Una noticia política se publica solo si tiene consecuencia financiera identificable (impuestos, gasto, regulación, deuda, política monetaria, comercio, sanciones, riesgo geopolítico). Economía del bolsillo (salarios, jubilaciones, créditos, plazo fijo, consumo) y tribunales: baja, salvo efecto claro en el mercado.

EMPRESAS: importa el resultado frente a lo esperado, cambios de previsiones, márgenes, flujo de caja, deuda e inversión. Crecer en ingresos no es mejorar la rentabilidad; un resultado positivo no es una sorpresa positiva. Una empresa mediana o chica también vale si el hecho es material.

ESTADO de cada noticia, elegí uno: "hecho" (confirmado), "dato_oficial" (de un banco central, organismo de estadística o empresa), "anuncio", "propuesta" (todavía no aprobada), "estimacion", "rumor", "analisis" (análisis o recomendación de un banco, broker o analista sobre activos concretos: qué acciones, CEDEAR, bonos o sectores, precios objetivo, cómo afecta un hecho a la bolsa), "opinion" (columna o declaración general sin activos concretos). Los rumores no se publican.
Un "analisis" sobre activos concretos es contenido de inversión valioso para este diario: puntualo por lo útil que es para decidir una inversión (normalmente 55-75), no lo bajes por ser análisis. Ej.: "Los CEDEAR que prometen más suba tras las elecciones" = 65; "Balotaje en Brasil: por qué es clave para Arcor, Despegar y Mercado Libre" = 65; "Galicia puede subir 97% según Morgan Stanley" = 75.

Para cada noticia devolvé:
- "puntaje": 0 a 100.
- "estado": uno de los de arriba (hecho, dato_oficial, anuncio, propuesta, estimacion, analisis, rumor, opinion).
- "motivo": en una frase corta, por qué le importa al mercado (el mecanismo concreto). Vacío si no hay.
- "activos": activos, empresas o sectores que puede afectar, separados por coma (ej. "bonos argentinos, riesgo país"). Vacío si no hay.
- "titulo": SOLO si te paso un título original en otro idioma (dice "original:"), traducilo al español neutro rioplatense, claro, factual, máximo 110 caracteres (cuidado con los apellidos: "Kazaks" es un apellido, no "kazajos"). Si no hay título original, devolvé "".
- "resumen": máximo 25 palabras, con tus palabras, con los hechos nuevos. Si es una propuesta, decí que es una propuesta; si es una estimación u opinión, decilo.

REGLAS QUE NO SE PUEDEN ROMPER (es un diario: un dato falso es gravísimo):
- Usá SOLO lo que dicen el título y el texto de cada noticia. No agregues años, fechas, cifras, porcentajes, cargos, nombres, declaraciones ni causas que no estén escritos ahí. Si no estás seguro de un dato, no lo pongas.
- No afirmes que un activo subió o bajó POR algo si la nota no lo dice: usá "en medio de" o "tras" en vez de "por".
- Distinguí hechos de estimaciones, expectativas, rumores y opiniones.
- Hoy es FECHA_DE_HOY. Donald Trump es el presidente de Estados Unidos (nunca "expresidente"). Javier Milei es el presidente de Argentina.
- No cambies el sentido de la noticia ni la hagas sonar más grave o más positiva de lo que es.

Respondé SOLO un JSON así: {"notas":[{"i":0,"puntaje":82,"estado":"dato_oficial","motivo":"...","activos":"...","titulo":"","resumen":"..."}]}`;

async function preguntarGroq(clave, contenido) {
  for (const modelo of MODELOS) {
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await traer('https://api.groq.com/openai/v1/chat/completions', {
          json: true, method: 'POST', timeout: 60000,
          headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelo, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: contenido }] }),
        });
        return JSON.parse(r.choices[0].message.content).notas || [];
      } catch (e) {
        if (/^429/.test(e.message) && intento < 2) { await new Promise(res => setTimeout(res, 25000)); continue; }   // límite por minuto: esperar y reintentar
        if (/^(400|404)/.test(e.message)) break;   // ese modelo ya no existe: probar el siguiente
        throw e;
      }
    }
  }
  throw new Error('ningún modelo de Groq respondió');
}

async function pasarPorIA(noticias) {
  const clave = await claveGroq();
  if (!clave) return noticias;
  let memoria = {};
  try { memoria = JSON.parse(await readFile(ARCHIVO_IA, 'utf8')); } catch {}
  const limite = Date.now() - 3 * 864e5;
  for (const k of Object.keys(memoria)) if (memoria[k].t < limite) delete memoria[k];

  // Por rondas (pedido de Marc): primero las 4 mejores de cada pestaña juntas (EE.UU., Argentina y Mundo),
  // después las 4 siguientes de cada una, y así. Si el límite gratis se acaba, lo de arriba de las tres
  // pestañas ya quedó revisado; lo que falta sigue solo con reglas. Solo se mandan las que Groq no vio.
  const POR_RONDA = 4;
  const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
  for (let ronda = 0; ronda < 8; ronda++) {
    const nuevas = ['eeuu', 'argentina', 'mundo'].flatMap(region => noticias
      .filter(n => n.region === region && !memoria[n.link])
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, POR_RONDA));
    if (!nuevas.length) break;
    if (ronda) await new Promise(res => setTimeout(res, 20000));   // el plan gratis limita cuánto texto por minuto
    const lista = nuevas.map((n, i) => `${i}. [${n.region} · ${n.tag} · ${n.fuente}] ${n.titulo}${n.tituloOriginal ? ` (original: ${n.tituloOriginal})` : ''} — ${n.resumen || recortar(n.resumenOriginal || '', 250)}`).join('\n');
    try {
      for (const { i, puntaje, estado, motivo, activos, titulo, resumen } of await preguntarGroq(clave, CRITERIO.replace('FECHA_DE_HOY', hoy) + '\n\n' + lista)) {
        const n = nuevas[i];
        if (n && Number.isFinite(+puntaje)) memoria[n.link] = { puntaje: Math.max(0, Math.min(100, +puntaje)), estado: estado || '', motivo: motivo || '', activos: activos || '', titulo: titulo || '', resumen: resumen || '', t: Date.now() };
      }
    } catch (e) { console.warn(`La IA no respondió en la ronda ${ronda + 1}; lo que falta sigue solo con reglas:`, e.message); break; }
  }
  await writeFile(ARCHIVO_IA, JSON.stringify(memoria));

  for (const n of noticias) {
    const ia = memoria[n.link];
    if (!ia) continue;
    if (!Number.isFinite(ia.puntaje)) continue;   // respuesta guardada con el criterio viejo
    n.ia = ia.puntaje;
    if (ia.titulo && n.tituloOriginal) n.titulo = ia.titulo;   // los títulos de diarios en español no se tocan
    if (ia.resumen) n.resumen = ia.resumen;
    // Para el "por qué te importa" (todavía no se muestra).
    n.porQue = ia.motivo; n.activos = ia.activos; n.estado = ia.estado;
    // Reglamento: menos de 50 o rumor no se publica ("mejor 5 noticias de alto impacto que 50 irrelevantes").
    // Si pasa: reglas 50% + IA 50%; una opinión baja 10.
    n.puntaje = Math.round(n.puntaje * 0.5 + ia.puntaje * 0.5 - (ia.estado === 'opinion' ? 10 : 0));
    n.debajoDelCorte = ia.puntaje < 50;   // no entra en la primera pasada; puede completar (si tiene 40 o más)
    if (ia.estado === 'rumor' || ia.puntaje < 40) n.puntaje = 0;   // rumores, política y relleno: nunca
  }
  return noticias;
}

// ───────────────────────── Precios ─────────────────────────

const ACTIVOS = [
  ['^GSPC', 'S&P 500', 'eeuu'], ['^IXIC', 'Nasdaq', 'eeuu'], ['^TNX', 'Bono 10 años', 'eeuu'],
  ['GC=F', 'Oro', 'mundo'], ['BZ=F', 'Brent', 'mundo'], ['SI=F', 'Plata', 'mundo'],
  ['BTC-USD', 'Bitcoin', 'mundo'], ['EWZ', 'Brasil (EWZ)', 'mundo'],
];

// La BLS deja consultar 25 veces por día sin clave, y el dato cambia una vez por mes:
// se guarda en un archivo y se vuelve a pedir recién a las 12 horas.
const ARCHIVO_INFLACION = new URL('./cache-inflacion-eeuu.json', import.meta.url);
async function inflacionEEUU() {
  let guardado = null;
  try {
    guardado = JSON.parse(await readFile(ARCHIVO_INFLACION, 'utf8'));
    if (Date.now() - guardado.pedido < 12 * 3600e3) return guardado;
  } catch {}
  // Si la BLS no responde (a veces se cae), sirve el último dato guardado: cambia una vez por mes.
  let d;
  try { d = await traer('https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0', { json: true }); }
  catch (e) { if (guardado) return guardado; throw e; }
  // Índice de precios por mes (M13 es el promedio del año y '-' un mes sin dato).
  const indice = {};
  for (const x of d.Results.series[0].data) if (/^M(0[1-9]|1[0-2])$/.test(x.period) && !isNaN(+x.value)) indice[x.year + x.period] = +x.value;
  const meses = Object.keys(indice).sort().reverse();
  const interanual = m => { const atras = (+m.slice(0, 4) - 1) + m.slice(4); return indice[atras] ? (indice[m] / indice[atras] - 1) * 100 : null; };
  const conDato = meses.filter(m => interanual(m) != null);
  const r = { pedido: Date.now(), mes: conDato[0], ultimo: interanual(conDato[0]), anterior: interanual(conDato[1]) };
  if (r.ultimo == null || r.anterior == null) throw new Error('faltan meses');
  await writeFile(ARCHIVO_INFLACION, JSON.stringify(r));
  return r;
}

async function precios() {
  const res = await Promise.allSettled(ACTIVOS.map(async ([sim, nombre, region]) => {
    const d = await traer(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sim)}?range=5d&interval=1d`, { json: true });
    const m = d.chart.result[0].meta;
    const ant = m.chartPreviousClose ?? m.previousClose;
    const variacion = m.regularMarketChangePercent ?? (ant ? (m.regularMarketPrice / ant - 1) * 100 : null);
    const unidad = sim === '^TNX' ? '%' : /^\^|\.SS$/.test(sim) ? '' : 'US$';
    return { region, nombre, hora: m.regularMarketTime, precio: m.regularMarketPrice, variacion, unidad };
  }));
  // Yahoo a veces deja un índice congelado (el Merval días sin actualizar):
  // si quedó más de 20 h atrás del S&P, no se muestra antes que mostrar un dato viejo.
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  const referencia = ok.find(p => p.nombre === 'S&P 500')?.hora || 0;
  const lista = ok.filter(p => p.hora >= referencia - 20 * 3600).map(({ hora, ...p }) => p);

  try {
    // Inflación de EE.UU. de los últimos 12 meses (IPC de la oficina de estadísticas, BLS; sale una vez
    // por mes). Va en el lugar que tenía el Dow Jones, después del Nasdaq. Abajo, cuántos puntos subió o
    // bajó contra el dato del mes anterior, en rojo si sube.
    const inf = await inflacionEEUU();
    const f = v => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dif = Math.round((inf.ultimo - inf.anterior) * 100) / 100;
    const nasdaq = lista.findIndex(p => p.nombre === 'Nasdaq');
    lista.splice(nasdaq === -1 ? lista.length : nasdaq + 1, 0, {
      region: 'eeuu', nombre: 'Inflación', precio: inf.ultimo, unidad: '%', texto: `${f(inf.ultimo)}%`,
      variacion: dif, inverso: true,
      cambioTexto: dif > 0 ? `subió ${f(dif)}` : dif < 0 ? `bajó ${f(-dif)}` : 'sin cambios',
    });
  } catch (e) { console.warn('No respondió la inflación de EE.UU.', e.message); }

  try {
    // Tasa de la Fed: es un rango anual (ej. 3,75–4,00%) que se decide unas 8 veces por año.
    // Se muestra solo el techo (4,00%), como hacen los sitios de datos económicos.
    // Se toma de la Fed de Nueva York y se busca el último cambio para mostrar si subió o bajó.
    const tasas = (await traer('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/500.json', { json: true })).refRates;
    const hoy = tasas[0];
    const antes = tasas.find(t => t.targetRateTo !== hoy.targetRateTo);
    const dif = antes ? hoy.targetRateTo - antes.targetRateTo : 0;
    const f = v => v.toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const fed = {
      region: 'eeuu', nombre: 'Tasa de la Fed', precio: hoy.targetRateTo, unidad: '%',
      texto: `${f(hoy.targetRateTo)}%`,
      variacion: dif, inverso: true,   // que suba la tasa es malo para el mercado: va en rojo
      cambioTexto: dif > 0 ? `subió ${f(dif)}` : dif < 0 ? `bajó ${f(-dif)}` : 'sin cambios',
    };
    const bono = lista.findIndex(p => p.nombre === 'Bono 10 años');
    lista.splice(bono === -1 ? lista.length : bono, 0, fed);
  } catch { console.warn('No respondió la tasa de la Fed'); }

  try {
    // Precio de ahora (dolarapi) contra el cierre del día hábil anterior (historial de ArgentinaDatos).
    const dolares = await traer('https://dolarapi.com/v1/dolares', { json: true });
    for (const casa of ['blue', 'oficial']) {   // con unshift quedan oficial, blue
      const d = dolares.find(x => x.casa === casa);
      if (!d) continue;
      let variacion = null;
      try {
        const dia = new Date(d.fechaActualizacion).toLocaleDateString('sv', { timeZone: 'America/Argentina/Buenos_Aires' });   // 2026-10-19
        const historial = await traer(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa}`, { json: true });
        const anterior = historial.filter(h => h.fecha < dia).at(-1);
        if (anterior) variacion = (d.venta / anterior.venta - 1) * 100;
      } catch { console.warn('Sin historial del dólar', casa); }
      lista.unshift({ region: 'argentina', nombre: 'Dólar ' + d.nombre.toLowerCase(), precio: d.venta, variacion, unidad: '$' });
    }
  } catch { console.warn('No respondió el dólar'); }
  try {
    // El último valor contra el del día anterior. inverso: subir es malo, la página lo pinta en rojo.
    const serie = await traer('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais', { json: true });
    const [ant, ult] = serie.slice(-2);
    lista.unshift({ region: 'argentina', nombre: 'Riesgo país', precio: ult.valor, variacion: (ult.valor / ant.valor - 1) * 100, inverso: true, unidad: 'pb' });
  } catch { console.warn('No respondió el riesgo país'); }
  try {
    // Merval: desde el 19/10/2026 lo administra MSCI (arrancó de nuevo en 100.000 puntos)
    // y Yahoo quedó congelado en el viejo. Se toma de BYMA, la bolsa (20 min de demora).
    // BYMA a veces tarda: si no responde, se intenta una vez más.
    const pedirMerval = () => traer('https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/index-price', {
      json: true, method: 'POST', timeout: 20000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'Content-Type': 'application/json' }),
    });
    const r = await pedirMerval().catch(pedirMerval);
    const m = r.data.find(x => x.symbol === 'MMSCI');
    lista.unshift({ region: 'argentina', nombre: 'MSCI Merval', precio: m.price, variacion: m.variation * 100, unidad: '' });
  } catch (e) { console.warn('No respondió el Merval', e.message); }
  try {
    // Inflación acumulada de los últimos 12 meses (INDEC, sale una vez por mes).
    const ultimo = (await traer('https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual', { json: true })).at(-1);
    lista.push({ region: 'argentina', nombre: 'Inflación', sub: '12 meses', precio: ultimo.valor, variacion: null, unidad: '%' });
  } catch { console.warn('No respondió la inflación'); }
  return lista;
}

// Las que más suben y bajan, solo entre empresas de EE.UU. de más de US$ 50.000 millones:
// nombres que la gente conoce y que en muchos casos se pueden comprar como CEDEAR.
// Sale del listado de Nasdaq, que trae todas las acciones grandes con su variación del día.
const TAMAÑO_MINIMO = 50e9;

// Solo empresas de EE.UU. (las de otros países van a la pestaña Mundo). Nasdaq anota el país
// donde está registrada la empresa, así que algunas estadounidenses figuran como Irlanda o Suiza:
const ESTADOUNIDENSES = ['ACN', 'ETN', 'STX', 'TT', 'TEL', 'CB', 'JCI', 'GRMN', 'SLB', 'NXPI'];
// Y unas pocas gigantes de afuera, muy seguidas acá, que cotizan en EE.UU. (Marc pidió TSMC "y demás").
const EXTRANJERAS_SI = ['TSM', 'ASML', 'ARM', 'SHOP', 'SPOT', 'MELI'];

async function movimientos() {
  try {
    const d = await traer('https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true&marketcap=mega|large', {
      json: true, headers: { Accept: 'application/json' },
    });
    const numero = v => parseFloat(String(v).replace(/[^0-9.-]/g, ''));
    const grandes = d.data.rows
      .filter(r => r.country === 'United States' || ESTADOUNIDENSES.includes(r.symbol) || EXTRANJERAS_SI.includes(r.symbol))
      .map(r => ({ simbolo: r.symbol, nombre: r.name, precio: numero(r.lastsale), variacion: numero(r.pctchange), tamaño: numero(r.marketCap) }))
      .filter(r => r.tamaño >= TAMAÑO_MINIMO && Number.isFinite(r.variacion))
      .sort((a, b) => b.variacion - a.variacion)
      .map(({ tamaño, ...r }) => r);
    return [grandes.filter(r => r.variacion > 0).slice(0, 5), grandes.filter(r => r.variacion < 0).slice(-5).reverse()];
  } catch (e) { console.warn('No respondió el listado de Nasdaq', e.message); return [[], []]; }
}

// Las que más suben y bajan en la bolsa argentina: las acciones del panel líder del Merval
// (las más conocidas: Galicia, YPF, Pampa…), en pesos, de los datos abiertos de BYMA (20 min de demora).
// Se toma el plazo de 24 hs, que es donde se opera casi todo.
const NOMBRES_ARG = {
  ALUA: 'Aluar', BBAR: 'BBVA Argentina', BMA: 'Banco Macro', BYMA: 'BYMA', CEPU: 'Central Puerto', COME: 'Comercial del Plata',
  CRES: 'Cresud', ECOG: 'Ecogas', EDN: 'Edenor', GGAL: 'Galicia', IRSA: 'IRSA', LOMA: 'Loma Negra', METR: 'Metrogas',
  PAMP: 'Pampa Energía', SUPV: 'Supervielle', TECO2: 'Telecom', TGNO4: 'TGN', TGSU2: 'TGS', TRAN: 'Transener',
  TXAR: 'Ternium Argentina', VALO: 'Grupo Valores', YPFD: 'YPF',
};

// Se guarda el último cierre con movimiento (cache-acciones-arg.json): el fin de semana y los feriados
// BYMA devuelve todo en cero, y en vez de dejar la lista vacía se muestra ese cierre ("cierre del viernes 23/10").
const ARCHIVO_ACCIONES_AR = new URL('./cache-acciones-arg.json', import.meta.url);
async function movimientosArg() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const delGuardado = async () => {
    try {
      const g = JSON.parse(await readFile(ARCHIVO_ACCIONES_AR, 'utf8'));
      if (g.dia === hoy) return [g.suben, g.bajan, ''];
      const f = new Date(g.dia + 'T12:00:00Z');
      const dia = f.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' });
      return [g.suben, g.bajan, `Cierre del ${dia} ${f.getUTCDate()}/${f.getUTCMonth() + 1}`];
    } catch { return [[], [], '']; }
  };
  // Respaldo: data912 tiene la variación del último día que operó la bolsa (sirve el fin de semana).
  const deRespaldo = async () => {
    try {
      const d = await traer('https://data912.com/live/arg_stocks', { json: true });
      const lista = d.filter(x => NOMBRES_ARG[x.symbol] && Number.isFinite(x.pct_change) && x.c > 0)
        .map(x => ({ simbolo: x.symbol, nombre: NOMBRES_ARG[x.symbol], precio: x.c, variacion: x.pct_change }))
        .sort((a, b) => b.variacion - a.variacion);
      if (!lista.length) return delGuardado();
      // Un día de semana data912 trae lo de hoy; el fin de semana, lo del último día hábil (no contempla feriados).
      const f = new Date(hoy + 'T12:00:00Z');
      if ([0, 6].includes(f.getUTCDay())) do f.setUTCDate(f.getUTCDate() - 1); while ([0, 6].includes(f.getUTCDay()));
      const dia = f.toISOString().slice(0, 10);
      const suben = lista.filter(x => x.variacion > 0).slice(0, 5), bajan = lista.filter(x => x.variacion < 0).slice(-5).reverse();
      await writeFile(ARCHIVO_ACCIONES_AR, JSON.stringify({ dia, suben, bajan }));
      return delGuardado();
    } catch { return delGuardado(); }
  };
  try {
    const d = await traer('https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/leading-equity', {
      json: true, method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludeZeroPxAndQty: true, T2: false, T1: true, T0: false }),
    });
    const lista = d.data
      .filter(x => x.previousClosingPrice > 0 && (x.trade || x.closingPrice) > 0)
      .map(x => ({ simbolo: x.symbol, nombre: NOMBRES_ARG[x.symbol] || x.symbol, precio: x.trade || x.closingPrice,
        variacion: ((x.trade || x.closingPrice) / x.previousClosingPrice - 1) * 100 }))
      .sort((a, b) => b.variacion - a.variacion);
    const suben = lista.filter(x => x.variacion > 0).slice(0, 5), bajan = lista.filter(x => x.variacion < 0).slice(-5).reverse();
    if (!suben.length && !bajan.length) return deRespaldo();   // fin de semana o feriado
    await writeFile(ARCHIVO_ACCIONES_AR, JSON.stringify({ dia: hoy, suben, bajan }));
    return [suben, bajan, ''];
  } catch (e) { console.warn('No respondió el panel líder de BYMA', e.message); return deRespaldo(); }
}

// ETF de sectores de EE.UU. (Marc, 2026-10-26): van al final de la pestaña Mundo, en el lugar donde
// EE.UU. y Argentina tienen "Más suben / Más bajan". Precio y variación del día de Yahoo; con el mercado
// cerrado queda la última cotización y la página avisa de qué día es ("Cierre del viernes 23/10").
const SECTORES = [
  ['XLK', 'Tecnología'], ['XLF', 'Finanzas'], ['XLE', 'Energía'], ['XLV', 'Salud'], ['XLI', 'Industria'],
  ['XLB', 'Materiales'], ['XLY', 'Consumo discrecional'], ['XLP', 'Consumo básico'], ['XLC', 'Comunicación'],
];
async function sectores() {
  const res = await Promise.allSettled(SECTORES.map(async ([simbolo, nombre]) => {
    const d = await traer(`https://query1.finance.yahoo.com/v8/finance/chart/${simbolo}?range=1d&interval=1d`, { json: true });
    const m = d.chart.result[0].meta;
    const variacion = m.regularMarketChangePercent ?? (m.regularMarketPrice / m.chartPreviousClose - 1) * 100;
    return { simbolo, nombre, precio: m.regularMarketPrice, variacion, hora: m.regularMarketTime };
  }));
  const lista = res.filter(r => r.status === 'fulfilled' && Number.isFinite(r.value.variacion)).map(r => r.value);
  if (res.some(r => r.status === 'rejected')) console.warn('No respondieron algunos ETF de sectores');
  if (!lista.length) return [[], ''];
  // De qué día es la cotización: si no es de hoy (fin de semana, feriado), se avisa.
  const enNY = t => new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const ultima = Math.max(...lista.map(x => x.hora));
  const hoyNY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  let cierre = '';
  if (enNY(ultima) !== hoyNY) {
    const f = new Date(ultima * 1000);
    const dia = f.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'America/New_York' });
    const [, mes, d] = enNY(ultima).split('-');
    cierre = `Cierre del ${dia} ${+d}/${+mes}`;
  }
  return [lista.map(({ hora, ...x }) => x), cierre];
}

// ───────────────────────── Armar todo ─────────────────────────

const [noticiasTodas, listaPrecios, [suben, bajan], [subenArg, bajanArg, cierreArg], [listaSectores, cierreSectores], agenda] = await Promise.all([
  juntarNoticias(), precios(), movimientos(), movimientosArg(), sectores().catch(() => [[], '']), calendario().catch(e => { console.warn('No se pudo armar el calendario', e.message); return []; }),
]);
// Para revisar el puntaje de todas las notas (no solo las elegidas): VOLCAR=1 node armar.mjs
if (process.env.VOLCAR) await writeFile(new URL("./todas-las-notas.json", import.meta.url), JSON.stringify(noticiasTodas.map(({ pal, ...n }) => n).sort((a, b) => b.puntaje - a.puntaje), null, 1));

// Por pestaña: sin la misma historia contada distinto y como mucho 2 del mismo tema.
// Empresas y personas que suelen acaparar el día: como mucho 2 notas de cada una por pestaña.
const PROTAGONISTAS = {
  tesla: [' tesla', ' musk', ' spacex', ' starlink'], apple: [' apple', ' iphone'], nvidia: [' nvidia'], microsoft: [' microsoft'],
  amazon: [' amazon'], google: [' google', ' alphabet'], meta: [' meta '], openai: [' openai', ' chatgpt'], ypf: [' ypf'],
  mercadolibre: [' mercadolibre', ' mercado libre'], galicia: [' galicia'], trump: [' trump'], milei: [' milei'], caputo: [' caputo'],
  bitcoin: [' bitcoin', ' btc ', ' cripto', ' ethereum'], brasil: [' ibovespa', ' brasil', ' lula', ' bolsonaro', ' real brasileno'],
};
const protagonistas = n => { const t = paraBuscar(n.titulo); return Object.keys(PROTAGONISTAS).filter(k => PROTAGONISTAS[k].some(p => t.includes(p))); };

function elegir(todas, cantidad) {
  const porTema = {}, porProtagonista = {};
  todas = [...todas].sort((a, b) => b.puntaje - a.puntaje);
  return todas
    .filter((n, i) => !todas.slice(0, i).some(m => m.tag === n.tag && parecido(new Set(m.pal), new Set(n.pal)) >= 0.3))
    .filter(n => (porTema[n.tag] = (porTema[n.tag] || 0) + 1) <= 2)
    .filter(n => protagonistas(n).every(p => (porProtagonista[p] = (porProtagonista[p] || 0) + 1) <= 2))
    .slice(0, cantidad);
}

const PESTAÑAS = ['eeuu', 'argentina', 'mundo'];
let candidatas = PESTAÑAS.flatMap(r => elegir(noticiasTodas.filter(n => n.region === r), CANTIDAD + 6));
// Toda nota tiene que tener foto: a las que no la traen se les busca en la página de la nota; si no hay, afuera.
await Promise.all(candidatas.filter(n => !n.imagen).map(async n => { n.imagen = await buscarFoto(n.link); }));
candidatas = candidatas.filter(n => n.imagen);
await traducirResumenes(candidatas);
candidatas = await pasarPorIA(candidatas);

// Noticias fijadas (pedido de Marc): si Groq le da 85 o más a una noticia ("crítica" en el reglamento:
// la Fed sube la tasa, una guerra que dispara el petróleo…), queda arriba de todo 24 horas, aunque salgan
// noticias más nuevas y aunque el diario ya la haya sacado de su lista. Como mucho 2 por pestaña.
// Las opiniones nunca se fijan. Lo de abajo sigue cambiando en cada actualización.
const CRITICA = 85, FIJADAS_POR_PESTAÑA = 2;
const ARCHIVO_FIJADAS = new URL('./fijadas.json', import.meta.url);
let fijadas = {};
try { fijadas = JSON.parse(await readFile(ARCHIVO_FIJADAS, 'utf8')); } catch {}
for (const [link, f] of Object.entries(fijadas)) if (Date.now() - f.desde > 24 * 3600e3) delete fijadas[link];
for (const n of candidatas)
  if (n.ia >= CRITICA && n.estado !== 'opinion' && !fijadas[n.link]) fijadas[n.link] = { desde: Date.now(), nota: n };
await writeFile(ARCHIVO_FIJADAS, JSON.stringify(fijadas));
// Las fijadas que ya no vinieron en esta actualización se vuelven a sumar como estaban.
const yaEstan = new Set(candidatas.map(n => n.link));
for (const { nota } of Object.values(fijadas)) if (!yaEstan.has(nota.link)) candidatas.push(nota);
for (const n of candidatas) n.fijada = !!fijadas[n.link];

// Se eligen las tres pestañas juntas, de la nota con más puntaje a la de menos: si una historia ya quedó
// en una pestaña (ej. la caída del bitcoin en Mundo), no se vuelve a poner en otra.
const elegidas = { eeuu: [], argentina: [], mundo: [] };
{
  const porTema = {}, porProtagonista = {}, puestas = [];
  const misma = (a, b) => { const pa = new Set(a.pal), pb = new Set(b.pal); return (a.tag === b.tag && parecido(pa, pb) >= 0.3) || parecido(pa, pb) >= 0.5; };
  const fijadasPuestas = {};
  // Primera pasada: lo bueno del último día (como siempre). Segunda: si una pestaña quedó con menos de
  // MINIMO, se completa con lo siguiente mejor de hasta 2 días atrás (Groq 40 o más, nunca rumores ni política).
  const ordenar = lista => lista.sort((a, b) => (b.fijada - a.fijada) || (b.fijada && a.fijada ? b.ia - a.ia : 0) || (b.puntaje - a.puntaje));
  const primera = ordenar(candidatas.filter(n => n.puntaje >= PUNTAJE_MINIMO && !n.debajoDelCorte && (n.fijada || n.horas <= 24)));
  const segunda = ordenar(candidatas.filter(n => n.puntaje >= 25 && !primera.includes(n)));
  for (const [pasada, enOrden] of [[1, primera], [2, segunda]])
  for (const n of enOrden) {
    const lista = elegidas[n.region];
    if (!lista || lista.length >= (pasada === 1 ? CANTIDAD : MINIMO) || puestas.some(m => misma(m, n))) continue;
    if (n.fijada && (fijadasPuestas[n.region] = (fijadasPuestas[n.region] || 0) + 1) > FIJADAS_POR_PESTAÑA) n.fijada = false;
    const tema = n.region + '|' + n.tag, prot = protagonistas(n).map(p => n.region + '|' + p);
    if ((porTema[tema] || 0) >= 2 || prot.some(p => (porProtagonista[p] || 0) >= 2)) continue;
    porTema[tema] = (porTema[tema] || 0) + 1;
    prot.forEach(p => { porProtagonista[p] = (porProtagonista[p] || 0) + 1; });
    lista.push(n);
    puestas.push(n);
  }
}

// Orden de los cuadraditos de precios (Marc, 2026-10-22): en EE.UU. primero S&P 500, inflación y tasa de la Fed.
const ORDEN_PRECIOS = {
  eeuu: ['S&P 500', 'Inflación', 'Tasa de la Fed', 'Bono 10 años', 'Nasdaq'],
  mundo: ['Oro', 'Brent', 'Bitcoin', 'Plata', 'Brasil (EWZ)'],
};
const lugar = (r, p) => { const i = (ORDEN_PRECIOS[r] || []).indexOf(p.nombre); return i === -1 ? 99 : i; };

const secciones = {};
for (const r of PESTAÑAS) {
  const noticias = elegidas[r];
  secciones[r] = {
    precios: listaPrecios.filter(p => p.region === r).sort((a, b) => lugar(r, a) - lugar(r, b)).map(({ region, ...p }) => p),
    suben: r === 'eeuu' ? suben : r === 'argentina' ? subenArg : [],
    bajan: r === 'eeuu' ? bajan : r === 'argentina' ? bajanArg : [],
    cierre: r === 'argentina' ? cierreArg : r === 'mundo' ? cierreSectores : '',   // "Cierre del viernes 23/10" cuando no es de hoy
    sectores: r === 'mundo' ? listaSectores : [],
    noticias: noticias.map(({ pal, region, resumenOriginal, tituloOriginal, debajoDelCorte, horas, ...n }) => n),
  };
}

await mkdir(new URL('./public/', import.meta.url), { recursive: true });
await writeFile(new URL('./public/noticias.json', import.meta.url), JSON.stringify({
  actualizado: new Date().toISOString(),
  secciones,
  calendario: agenda,
  fuentes: {
    medios: [...new Set(DIARIOS.map(d => d.fuente))].map(nombre => ({ nombre, pais: MEDIOS[nombre]?.[0] || '', web: MEDIOS[nombre]?.[1] || '' })),
  },
}, null, 2));

for (const r of PESTAÑAS) {
  console.log(`\n── ${r.toUpperCase()}: ${secciones[r].noticias.length} noticias, ${secciones[r].precios.length} precios`);
  for (const n of secciones[r].noticias) console.log(String(n.puntaje).padStart(3), `[${n.tag}]`.padEnd(18), `${n.medios} medios`.padEnd(9), n.fuente.padEnd(16), n.titulo.slice(0, 80));
}
