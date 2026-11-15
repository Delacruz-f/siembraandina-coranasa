const fs = require('fs');
const filtro = process.argv[2] || '';
const base = fs.readFileSync('views/layouts/base.ejs', 'utf8');
const orden = [...base.matchAll(new RegExp('/css/([a-z0-9-]+[.]css)', 'g'))].map((m) => m[1]);

function sinComentarios(t) {
  let r = '';
  let i = 0;
  while (i < t.length) {
    if (t.startsWith('/*', i)) {
      const f = t.indexOf('*/', i + 2);
      const fin = f < 0 ? t.length : f + 2;
      r += t.slice(i, fin).split('').map((c) => (c === '\n' ? '\n' : ' ')).join('');
      i = fin;
    } else {
      r += t[i++];
    }
  }
  return r;
}

const mapa = new Map();
for (const archivo of orden) {
  const t = sinComentarios(fs.readFileSync('public/css/' + archivo, 'utf8'));
  let ini = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '{') {
      const bruto = t.slice(ini, i);
      const sel = bruto.trim();
      if (sel && !sel.startsWith('@') && !sel.startsWith('from') && !sel.startsWith('to')) {
        const pos = ini + (bruto.length - bruto.trimStart().length);
        const linea = t.slice(0, pos).split('\n').length;
        for (const una of sel.split(',')) {
          const nombre = una.split('\n').join(' ').split('\r').join('').trim().split('  ').join(' ');
          if (!nombre || !nombre.includes(filtro)) continue;
          if (!mapa.has(nombre)) mapa.set(nombre, []);
          mapa.get(nombre).push(archivo + ':' + linea);
        }
      }
      ini = i + 1;
    } else if (c === '}' || c === ';') {
      ini = i + 1;
    }
  }
}
console.log('Orden de carga:', orden.join(' > '));
let n = 0;
for (const [sel, sitios] of mapa) {
  if (new Set(sitios.map((s) => s.split(':')[0])).size > 1) {
    console.log(sel + '  ->  ' + sitios.join(', '));
    n++;
  }
}
console.log('Selectores repetidos en varios archivos:', n);