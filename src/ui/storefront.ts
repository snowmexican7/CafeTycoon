/** The title-screen street scene (docs/mockups/title.png): a warm brick café between two neighbours. */
export function storefrontSVG(): string {
  const defs = `<defs><linearGradient id="tf-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9b0"/><stop offset=".55" stop-color="#ffe9cf"/><stop offset="1" stop-color="#fff2df"/></linearGradient>
<linearGradient id="tf-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3a6"/><stop offset="1" stop-color="#f5b874"/></linearGradient>
<pattern id="tf-aw" width="56" height="10" patternUnits="userSpaceOnUse"><rect width="28" height="10" fill="#e0564a"/><rect x="28" width="28" height="10" fill="#fff4e2"/></pattern>
<pattern id="tf-brick" width="40" height="20" patternUnits="userSpaceOnUse"><rect width="40" height="20" fill="#c8775a"/><rect x="1" y="1" width="38" height="8" rx="2" fill="#d4866a"/><rect x="-19" y="11" width="38" height="8" rx="2" fill="#d4866a"/><rect x="21" y="11" width="38" height="8" rx="2" fill="#d4866a"/></pattern></defs>`;
  let s = '<circle cx="640" cy="170" r="70" fill="#fff6dc"/>';
  for (const [x, y, w] of [[90, 120, 120], [1010, 90, 150], [560, 70, 90]])
    s += `<g fill="#fff" opacity=".85"><ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${w / 6}"/><ellipse cx="${x - w / 5}" cy="${y - 8}" rx="${w / 4}" ry="${w / 6}"/><ellipse cx="${x + w / 6}" cy="${y - 12}" rx="${w / 5}" ry="${w / 6}"/></g>`;
  s += '<rect x="-20" y="250" width="300" height="470" fill="#b9c9a8"/><rect x="280" y="210" width="40" height="510" fill="#a7b897"/><rect x="980" y="230" width="320" height="490" fill="#9fb6c9"/>';
  for (let x = 10; x < 260; x += 70) for (let y = 290; y < 560; y += 90) s += `<rect x="${x}" y="${y}" width="44" height="58" rx="6" fill="#f3ead6"/><rect x="${x + 4}" y="${y + 4}" width="36" height="50" rx="4" fill="#d9e8ef"/>`;
  for (let x = 1000; x < 1280; x += 72) for (let y = 270; y < 560; y += 90) s += `<rect x="${x}" y="${y}" width="44" height="58" rx="6" fill="#eef1f3"/><rect x="${x + 4}" y="${y + 4}" width="36" height="50" rx="4" fill="#ffe7b8"/>`;
  s += '<rect x="320" y="200" width="660" height="520" fill="url(#tf-brick)"/><rect x="310" y="186" width="680" height="24" rx="6" fill="#6e4129"/>';
  s += '<rect x="360" y="226" width="580" height="70" rx="14" fill="#3a2418"/><text x="650" y="276" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="700" font-size="44" fill="#f6c35b" letter-spacing="2">COFFEE &amp; CO.</text>';
  s += `<path d="M330 316 h640 l-20 70 h-600z" fill="url(#tf-aw)"/><path d="M350 386 ${'q25 22 50 0 '.repeat(12)}" fill="#e0564a" stroke="#c8443a" stroke-width="2"/><rect x="326" y="306" width="648" height="14" rx="7" fill="#b5392f"/>`;
  for (const x of [350, 700]) s += `<rect x="${x}" y="410" width="250" height="220" rx="10" fill="#6e4129"/><rect x="${x + 12}" y="422" width="226" height="196" rx="6" fill="url(#tf-glass)"/>`;
  s += '<rect x="380" y="540" width="190" height="78" fill="#c9895a"/><rect x="400" y="500" width="70" height="40" rx="8" fill="#e0564a"/><rect x="400" y="496" width="70" height="8" rx="4" fill="#dfe6ea"/><rect x="490" y="490" width="30" height="50" rx="10" fill="#9fd0ee"/>';
  for (const x of [420, 530, 760, 880]) s += `<path d="M${x} 422 v24" stroke="#3a2418" stroke-width="2"/><path d="M${x - 14} 460 q14 -18 28 0z" fill="#2f3b36"/><ellipse cx="${x}" cy="470" rx="40" ry="26" fill="#fff3c4" opacity=".45"/>`;
  s += '<g><circle cx="790" cy="520" r="16" fill="#f2c6a0"/><path d="M774 520a16 16 0 0 1 32 0q-8 -6 -16 -4q-8 -2 -16 4z" fill="#4a2c1d"/><rect x="772" y="536" width="36" height="60" rx="14" fill="#4c8fd6"/><rect x="780" y="544" width="20" height="34" rx="4" fill="#fffaf2"/></g>';
  s += '<g><circle cx="866" cy="530" r="15" fill="#c98d62"/><circle cx="866" cy="527" r="15" fill="#2b1a12"/><rect x="849" y="545" width="34" height="56" rx="14" fill="#8a6bbf"/></g>';
  s += '<rect x="712" y="580" width="226" height="38" fill="#a7653c"/><rect x="706" y="574" width="238" height="10" rx="4" fill="#f3efe9"/>';
  for (const w of [362, 712]) s += `<path d="M${w + 20} 430 l60 0 l-80 80z" fill="#fff" opacity=".25"/>`;
  s += '<rect x="608" y="400" width="84" height="320" rx="8" fill="#4e3324"/><rect x="618" y="414" width="64" height="150" rx="6" fill="url(#tf-glass)"/><circle cx="676" cy="600" r="5" fill="#f6c35b"/><rect x="622" y="460" width="56" height="26" rx="5" fill="#fff4e2"/><text x="650" y="479" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="700" font-size="15" fill="#4fae7b">OPEN</text>';
  for (const x of [330, 950])
    s += `<rect x="${x - 26}" y="660" width="52" height="44" rx="6" fill="#d9774f"/>${[[-14, -10, 16], [10, -14, 18], [0, -30, 18], [-18, -28, 12], [16, -34, 12]]
      .map(([dx, dy, r]) => `<circle cx="${x + dx}" cy="${660 + dy}" r="${r}" fill="${r > 15 ? '#6fb36b' : '#82c47c'}"/>`)
      .join('')}`;
  s += '<g><path d="M520 712 l26 -96 l26 96" stroke="#6e4129" stroke-width="6" fill="none"/><rect x="510" y="620" width="72" height="70" rx="6" fill="#2f3b36" stroke="#8b5a3a" stroke-width="5"/><text x="546" y="646" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="600" font-size="13" fill="#fff4e2">co-op</text><text x="546" y="664" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="600" font-size="13" fill="#f6c35b">lattes</text><text x="546" y="680" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="800" font-size="10" fill="#9fd0ee">today!</text></g>';
  s += '<path d="M320 196 q110 40 220 0 q110 40 220 0 q110 40 230 0" stroke="#3a2418" stroke-width="2" fill="none"/>';
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const x = 320 + t * 670;
    const lt = t * 3 - Math.floor(t * 3);
    s += `<circle cx="${x.toFixed(1)}" cy="${(199 + 40 * lt * (1 - lt)).toFixed(1)}" r="6" fill="${['#f6c35b', '#ffe7a3', '#e0564a', '#7fcfb4'][i % 4]}"/>`;
  }
  const ground = `<rect x="0" y="700" width="1280" height="100" fill="#d8c3a5"/>${Array.from({ length: 17 }, (_, i) => `<rect x="${i * 80}" y="700" width="2" height="100" fill="#c4ac8b"/>`).join('')}<rect x="0" y="696" width="1280" height="8" fill="#bfa684"/>`;
  return `<svg class="storefront" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${defs}<rect width="1280" height="800" fill="url(#tf-sky)"/>${ground}<g transform="translate(604 712) scale(.64) translate(-650 -712)">${s}</g></svg>`;
}
