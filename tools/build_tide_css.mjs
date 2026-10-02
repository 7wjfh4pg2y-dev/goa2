// One-off: turn the design mock's theme (unscoped, written for static HTML) into src/lib/ui/tide.css,
// with every rule scoped under `.tide` so it can never touch the in-game screens.
//   node tools/build_tide_css.mjs <path to the mock theme.css>
import fs from 'node:fs';
import postcss from 'postcss';
import nested from 'postcss-nested';
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n').split('\n');
const take = (a, b) => src.slice(a - 1, b).join('\n'); // 1-based, inclusive
let tokens = take(13, 120).replace(/:root \{/g, '& {');
let body = [take(160, 173), take(228, 1067), take(1239, 1307)].join('\n\n');
let motion = take(1607, src.length);
// keyframes can't live inside a rule: lift them out
const frames = [];
motion = motion.replace(/@keyframes [\s\S]*?\n\}\n/g, (m) => { frames.push(m); return ''; });
const wrapped = `.tide {\n${tokens}\n\n& {\n\tcolor: var(--ink);\n\tfont-size: var(--fs-body);\n\tline-height: 1.3;\n\tletter-spacing: 0.02em;\n}\nbutton, input { font: inherit; letter-spacing: inherit; color: inherit; }\nbutton { cursor: pointer; }\np { margin: 0; }\n\n${body}\n\n${motion}\n}\n\n${frames.join('\n')}`;
const out = await postcss([nested()]).process(wrapped, { from: undefined });
const head = `/* THE TIDE — the pre-game design language (deep sea · navy glass · brass · copper vs ice).\n   Generated once from the approved mock by tools/build_tide_css.mjs, then maintained by hand.\n   EVERYTHING is scoped under .tide (wrap a screen in <div class="tide">), so nothing here can\n   reach the in-game HUD. Tokens are custom properties on .tide; screens add layout only. */\n`;
fs.writeFileSync('src/lib/ui/tide.css', head + out.css);
console.log('tide.css', (out.css.length / 1024).toFixed(1), 'KB');
