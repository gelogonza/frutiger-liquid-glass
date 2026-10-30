const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const wallpaper = fs.readFileSync(path.join(root, 'aero-landscape.jpg'));
const built = read('main.template.js')
  .replace('__VERTEX__', JSON.stringify(read('shaders/vertex.glsl')))
  .replace('__FRAGMENT__', JSON.stringify(read('shaders/fragment.glsl')))
  .replace('__WALLPAPER__', JSON.stringify(`data:image/jpeg;base64,${wallpaper.toString('base64')}`));

if (/__(?:VERTEX|FRAGMENT|WALLPAPER)__/.test(built)) {
  throw new Error('Unresolved build placeholder');
}
fs.writeFileSync(path.join(root, 'main.js'), built);
console.log('Built main.js from local shader and wallpaper sources.');
