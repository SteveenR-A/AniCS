// Compose vectors from the same Lucide SVG nodes used by the Tauri frontend.
const fs = require('node:fs');
const path = require('node:path');
const lucide = require('lucide-react');
const names = ['House','Search','CalendarDays','Flame','Download','History','Heart','Settings','Tv','ChevronDown','ChevronLeft','ChevronRight','ArrowLeft','RefreshCw','SlidersHorizontal','X','Check','Play','Pause','SkipBack','SkipForward','RotateCcw','RotateCw','ListVideo','Server','Maximize','Minimize','Smartphone','Monitor','Volume2','VolumeX','Lock','Unlock','Folder','HardDrive','Trash2','Palette','Cloud','Globe','Plus','Trophy','Star','Clock','CircleAlert','SearchX','Database','CheckCheck','Film','Sparkles'];
function svgPath([tag,a]) {
  if(tag==='path') return a.d;
  if(tag==='line') return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
  if(tag==='polyline'||tag==='polygon') return 'M'+a.points.trim().replace(/\s+/g,'L')+(tag==='polygon'?'Z':'');
  if(tag==='circle') return `M${+a.cx + +a.r} ${a.cy}a${a.r} ${a.r} 0 1 0 ${-2*a.r} 0a${a.r} ${a.r} 0 1 0 ${2*a.r} 0`;
  if(tag==='ellipse') return `M${+a.cx + +a.rx} ${a.cy}a${a.rx} ${a.ry} 0 1 0 ${-2*a.rx} 0a${a.rx} ${a.ry} 0 1 0 ${2*a.rx} 0`;
  if(tag==='rect') {
    const x=+a.x||0,y=+a.y||0,w=+a.width,h=+a.height,r=+a.rx||0;
    return `M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
  }
  throw Error('Unsupported SVG '+tag);
}
const header = `// Generated from Lucide SVGs by scripts/android-native/generate-icons.cjs.
// Lucide ISC license: docs/android-native/lucide-LICENSE.
package com.anics.nativeapp.ui.components

import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.*
import androidx.compose.ui.unit.dp

object AniIcons {
    private fun icon(name: String, vararg paths: String) = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        paths.forEach { addPath(PathParser().parsePathString(it).toNodes(), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) }
    }.build()
    private fun filledIcon(name: String, path: String) = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        addPath(PathParser().parsePathString(path).toNodes(), fill = SolidColor(Color.Black), stroke = SolidColor(Color.Black), strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
    }.build()
`;
const heartPath = JSON.stringify(lucide.Heart.render({},null).props.iconNode.map(svgPath)[0] + 'Z');
const out = header + names.map(name => `    val ${name} by lazy { icon("${name}", ${lucide[name].render({},null).props.iconNode.map(svgPath).map(JSON.stringify).join(', ')}) }`).join('\n') + `\n    val HeartFilled by lazy { filledIcon("HeartFilled", ${heartPath}) }\n}\n`;
const root=path.resolve(__dirname,'../..');
const destination=path.join(root,'android-native/app/src/main/java/com/anics/nativeapp/ui/components');
fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,'AniIcons.kt'),out);
fs.copyFileSync(require.resolve('lucide-react/package.json').replace('package.json','LICENSE'),path.join(root,'docs/android-native/lucide-LICENSE'));
