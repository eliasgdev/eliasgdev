// Cambia el chiste y el dato del día en el README. Lo ejecuta .github/workflows/diario.yml.
import { readFileSync, writeFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const { chistes, datos } = JSON.parse(readFileSync(new URL('scripts/datos.json', raiz), 'utf8'));

// Fecha en hora de Bogotá, para que el cambio de día coincida con el local.
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const dia = Math.floor(Date.parse(hoy) / 86_400_000);

const chiste = chistes[dia % chistes.length];
const dato = datos[(dia * 7) % datos.length];

const bloque = `<!-- DIA:INICIO -->
> **Chiste del día**<br>
> ${chiste}

> **¿Sabías que...?**<br>
> ${dato}

<sub>Se actualiza solo todos los días · última actualización: ${hoy}</sub>
<!-- DIA:FIN -->`;

const ruta = new URL('README.md', raiz);
const readme = readFileSync(ruta, 'utf8');
const nuevo = readme.replace(/<!-- DIA:INICIO -->[\s\S]*<!-- DIA:FIN -->/, bloque);
if (nuevo === readme && !readme.includes('<!-- DIA:INICIO -->')) {
  throw new Error('No encontré los marcadores DIA:INICIO / DIA:FIN en el README');
}
writeFileSync(ruta, nuevo);
console.log(`${hoy}: chiste ${dia % chistes.length}, dato ${(dia * 7) % datos.length}`);
