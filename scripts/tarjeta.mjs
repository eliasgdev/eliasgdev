// Genera la tarjeta tipo terminal (assets/tarjeta-*.svg) y la sección
// "¿Cuándo programo?" del README con datos reales de GitHub.
// Lo ejecuta .github/workflows/diario.yml. Necesita GH_TOKEN en el entorno:
// con el GITHUB_TOKEN del Action solo ve repos públicos; con un token personal
// de solo lectura (secreto PERFIL_TOKEN) también cuenta los privados.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const USUARIO = 'eliasgdev';
const ZONA = 'America/Bogota';
const IGNORAR = new Set(['eliasgdev']); // el repo del perfil se commitea solo cada día

const raiz = new URL('../', import.meta.url);
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) throw new Error('Falta GH_TOKEN');

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'User-Agent': 'perfil-eliasgdev' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

// ---------- Datos ----------

const { user } = await gql(
  `query($login: String!) {
    user(login: $login) {
      id createdAt
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
        totalCount
        nodes { name defaultBranchRef { name } }
      }
      contributionsCollection {
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      }
    }
  }`,
  { login: USUARIO },
);

const commits = [];
for (const repo of user.repositories.nodes) {
  if (IGNORAR.has(repo.name) || !repo.defaultBranchRef) continue;
  let cursor = null;
  do {
    const data = await gql(
      `query($owner: String!, $name: String!, $autor: ID!, $cursor: String) {
        repository(owner: $owner, name: $name) {
          defaultBranchRef { target { ... on Commit {
            history(first: 100, after: $cursor, author: { id: $autor }) {
              pageInfo { hasNextPage endCursor }
              nodes { committedDate additions deletions }
            }
          } } }
        }
      }`,
      { owner: USUARIO, name: repo.name, autor: user.id, cursor },
    );
    const historia = data.repository.defaultBranchRef.target.history;
    commits.push(...historia.nodes);
    cursor = historia.pageInfo.hasNextPage ? historia.pageInfo.endCursor : null;
  } while (cursor);
}

// ---------- Cálculos ----------

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: ZONA });

function uptime(desde, hasta) {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  let anios = a2 - a1, meses = m2 - m1, dias = d2 - d1;
  if (dias < 0) { meses--; dias += new Date(Date.UTC(a2, m2 - 1, 0)).getUTCDate(); }
  if (meses < 0) { anios--; meses += 12; }
  const p = (n, s, pl) => `${n} ${n === 1 ? s : pl}`;
  return [anios && p(anios, 'año', 'años'), meses && p(meses, 'mes', 'meses'), p(dias, 'día', 'días')]
    .filter(Boolean).join(', ');
}

const dias = user.contributionsCollection.contributionCalendar.weeks
  .flatMap((s) => s.contributionDays)
  .filter((d) => d.date <= hoy);
let racha = 0;
for (let i = dias.length - 1; i >= 0; i--) {
  if (dias[i].contributionCount > 0) racha++;
  else if (i === dias.length - 1) continue; // hoy todavía puede no tener commits
  else break;
}
let mejorRacha = 0, actual = 0;
for (const d of dias) { actual = d.contributionCount > 0 ? actual + 1 : 0; mejorRacha = Math.max(mejorRacha, actual); }

// Los commits gigantes suelen ser node_modules, builds o dumps: no cuentan como líneas escritas.
const MAX_LINEAS_COMMIT = 10_000;
const escritos = commits.filter((c) => c.additions + c.deletions <= MAX_LINEAS_COMMIT);
const sumadas = escritos.reduce((s, c) => s + c.additions, 0);
const borradas = escritos.reduce((s, c) => s + c.deletions, 0);
const miles = (n) => n.toLocaleString('es-CO');

const franjas = [
  { nombre: 'Madrugada', rango: '00–06', n: 0 },
  { nombre: 'Mañana', rango: '06–12', n: 0 },
  { nombre: 'Tarde', rango: '12–18', n: 0 },
  { nombre: 'Noche', rango: '18–24', n: 0 },
];
const semana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((nombre) => ({ nombre, n: 0 }));
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
const indiceDia = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
for (const c of commits) {
  const partes = Object.fromEntries(fmt.formatToParts(new Date(c.committedDate)).map((p) => [p.type, p.value]));
  franjas[Math.floor(Number(partes.hour) / 6)].n++;
  semana[indiceDia[partes.weekday]].n++;
}

// ---------- Tarjeta SVG ----------

const ANCHO = 54; // caracteres de la columna de texto
const linea = (...trozos) => trozos;              // [[clase, texto], ...]
const titulo = (texto) => linea(['clave', texto + ' '], ['tenue', '─'.repeat(ANCHO - texto.length - 1)]);
const dato = (clave, valor) => {
  const relleno = ANCHO - clave.length - valor.length - 4;
  return linea(['clave', clave], ['tenue', ': ' + '.'.repeat(Math.max(relleno, 1)) + ' '], ['valor', valor]);
};
const vacia = () => linea();

const texto = [
  linea(['usuario', 'elias'], ['tenue', '@'], ['usuario', 'eliasgdev'], ['tenue', ' ' + '─'.repeat(ANCHO - 16)]),
  dato('SO', 'Fedora Linux, Windows, Android'),
  dato('Uptime', uptime(user.createdAt.slice(0, 10), hoy)),
  dato('Host', 'Universidad El Bosque, Bogotá'),
  dato('Kernel', 'Ingeniería de Sistemas'),
  dato('Proceso activo', 'Avirexis, SaaS para negocios'),
  dato('IDE', 'VS Code, Android Studio'),
  vacia(),
  dato('Lenguajes.Código', 'TypeScript, Python, Java, Kotlin'),
  dato('Lenguajes.Datos', 'SQL, JSON, YAML'),
  dato('Stack.Backend', 'Node.js, Spring, PostgreSQL'),
  dato('Stack.Frontend', 'Angular, React Native'),
  dato('Aprendiendo', 'Agentes de IA, MCP, RAG'),
  dato('Hobbies', 'Moto, música, café'),
  vacia(),
  titulo('Contacto'),
  dato('Email', 'gutierrez.miguel.elias@gmail.com'),
  dato('LinkedIn', 'miguel-elias-gutierrez'),
  dato('Web', 'avirexis.com'),
  vacia(),
  titulo('GitHub'),
  dato('Repos', String(user.repositories.totalCount)),
  dato('Contribuciones (año)', miles(user.contributionsCollection.contributionCalendar.totalContributions)),
  dato('Racha', `${racha} días (mejor: ${mejorRacha})`),
  dato('Commits analizados', miles(commits.length)),
  linea(
    ['clave', 'Líneas de código'],
    ['tenue', ': ' + '.'.repeat(Math.max(ANCHO - 16 - 4 - `${miles(sumadas - borradas)} ( +${miles(sumadas)}, -${miles(borradas)} )`.length, 1)) + ' '],
    ['valor', miles(sumadas - borradas)],
    ['tenue', ' ( '], ['suma', '+' + miles(sumadas)], ['tenue', ', '], ['resta', '-' + miles(borradas)], ['tenue', ' )'],
  ),
];

const arte = readFileSync(new URL('scripts/arte.txt', raiz), 'utf8').replace(/\n$/, '').split('\n');
// Bogotá al atardecer, igual que la foto de perfil. El color sale de la fila
// (cielo, cerros, ciudad, vía) y del carácter.
const VIAS = arte.flatMap((l, i) => (/^=+$/.test(l) ? [i] : []));
const CIUDAD = arte.findIndex((l) => l.includes('||'));
const SOL = arte.findIndex((l) => l.includes('~~~'));
const SOL_COLS = [arte[SOL].indexOf('.-~') - 2, arte[SOL].lastIndexOf('~-.') + 4];
const claseArte = (fila, ch, col) => {
  if (fila >= VIAS[0]) {
    if ('=-'.includes(ch)) return 'via';
    return 'moto';
  }
  if (fila >= CIUDAD) {
    if (':.'.includes(ch)) return 'ventana';
    return 'edificio';
  }
  if ('/\\V^'.includes(ch)) return 'montana';
  if ('+n|_!'.includes(ch)) return 'iglesia';
  if ((fila === SOL || fila === SOL + 1) && ".-~'".includes(ch) && col >= SOL_COLS[0] && col <= SOL_COLS[1]) return 'sol';
  if (fila >= SOL - 1 && ch === '.') return 'roca';
  return 'cielo';
};
const trozosArte = (l, fila) => {
  const trozos = [];
  [...l].forEach((ch, col) => {
    const clase = ch === ' ' ? null : claseArte(fila, ch, col);
    const ultimo = trozos.at(-1);
    if (ultimo && (ultimo[0] === clase || ch === ' ')) ultimo[1] += ch;
    else trozos.push([clase, ch]);
  });
  return trozos;
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ALTO_LINEA = 20, MARGEN = 30;
const filas = Math.max(texto.length, arte.length);
const alto = filas * ALTO_LINEA + MARGEN * 2 - 6;
const desplazamientoArte = Math.floor((filas - arte.length) / 2);

const temas = {
  oscuro: { fondo: '#0d1117', borde: '#30363d', clave: '#58a6ff', valor: '#e6edf3', tenue: '#484f58', usuario: '#79c0ff', suma: '#3fb950', resta: '#f85149', cielo: '#6e7681', sol: '#f0883e', montana: '#2f81f7', iglesia: '#e6edf3', roca: '#1f3a68', edificio: '#6e7681', ventana: '#e3b341', via: '#484f58', moto: '#e6edf3' },
  claro: { fondo: '#f6f8fa', borde: '#d0d7de', clave: '#0550ae', valor: '#1f2328', tenue: '#afb8c1', usuario: '#0969da', suma: '#1a7f37', resta: '#cf222e', cielo: '#8c959f', sol: '#bc4c00', montana: '#0969da', iglesia: '#57606a', roca: '#b6c8e6', edificio: '#6e7781', ventana: '#9a6700', via: '#afb8c1', moto: '#1f2328' },
};

function svg(t) {
  const estilos = Object.entries(t).filter(([k]) => !['fondo', 'borde'].includes(k))
    .map(([k, v]) => `.${k}{fill:${v}}`).join('');
  const lineasArte = arte.map((l, i) =>
    `<tspan x="${MARGEN}" y="${MARGEN + 14 + (i + desplazamientoArte) * ALTO_LINEA}">${trozosArte(l, i)
      .map(([c, s]) => (c ? `<tspan class="${c}">${esc(s)}</tspan>` : esc(s))).join('')}</tspan>`).join('\n');
  const lineasTexto = texto.map((trozos, i) =>
    `<tspan x="420" y="${MARGEN + 14 + i * ALTO_LINEA}">${trozos.map(([c, s]) => `<tspan class="${c}">${esc(s)}</tspan>`).join('')}</tspan>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" font-family="ConsolasFallback,Consolas,'DejaVu Sans Mono','Courier New',monospace" width="985" height="${alto}" font-size="16px">
<style>@font-face{src:local('Consolas'),local('Consolas Bold');font-family:'ConsolasFallback';font-display:swap;-webkit-size-adjust:109%;size-adjust:109%}${estilos}text,tspan{white-space:pre}</style>
<rect width="985" height="${alto}" fill="${t.fondo}" rx="15" stroke="${t.borde}" stroke-width="1"/>
<text xml:space="preserve">
${lineasArte}
</text>
<text xml:space="preserve">
${lineasTexto}
</text>
</svg>
`;
}

mkdirSync(new URL('assets/', raiz), { recursive: true });
for (const [nombre, tema] of Object.entries(temas)) {
  writeFileSync(new URL(`assets/tarjeta-${nombre}.svg`, raiz), svg(tema));
}

// ---------- Sección "¿Cuándo programo?" ----------

const total = commits.length || 1;
const barra = (n) => {
  const llenos = Math.round((n / total) * 25);
  return '█'.repeat(llenos) + '░'.repeat(25 - llenos);
};
const filaTexto = (etiqueta, n) =>
  `${etiqueta.padEnd(20)}${String(n).padStart(4)} commits   ${barra(n)}  ${((n / total) * 100).toFixed(1).padStart(5)} %`;

const masFranja = franjas.reduce((a, b) => (b.n > a.n ? b : a));
const masDia = semana.reduce((a, b) => (b.n > a.n ? b : a));
const frase = {
  Madrugada: 'Programo más de madrugada, cuando todo el mundo duerme',
  Mañana: 'Programo más en la mañana, con el primer café',
  Tarde: 'Programo más en la tarde, después de clase',
  Noche: 'Programo más de noche',
}[masFranja.nombre];

const bloque = `<!-- HORARIO:INICIO -->
**${frase}.** El día que más commits hago es el **${masDia.nombre.toLowerCase()}**.

\`\`\`text
${franjas.map((f) => filaTexto(`${f.nombre} (${f.rango})`, f.n)).join('\n')}
\`\`\`

\`\`\`text
${semana.map((d) => filaTexto(d.nombre, d.n)).join('\n')}
\`\`\`

<sub>Calculado con ${miles(commits.length)} commits en hora de Bogotá · ${hoy}</sub>
<!-- HORARIO:FIN -->`;

const ruta = new URL('README.md', raiz);
const readme = readFileSync(ruta, 'utf8');
if (!readme.includes('<!-- HORARIO:INICIO -->')) throw new Error('No encontré HORARIO:INICIO / HORARIO:FIN en el README');
writeFileSync(ruta, readme.replace(/<!-- HORARIO:INICIO -->[\s\S]*<!-- HORARIO:FIN -->/, bloque));

console.log(`${hoy}: ${commits.length} commits, racha ${racha}, +${sumadas} -${borradas}`);
