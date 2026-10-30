/* Local Obsidian adaptation. Upstream shader: Copyright (c) 2024 Charles Yin, MIT. */
const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');
const VERTEX = __VERTEX__;
const FRAGMENT = __FRAGMENT__;
const WALLPAPER = __WALLPAPER__;
const DEFAULTS = { enabled: true, strength: 0.035, thickness: 22, dispersion: 5, glare: 0.5 };

class GlassRenderer {
  constructor(root, settings, onError = () => {}, wallpaperUrl = WALLPAPER) {
    this.root = root;
    this.doc = root.ownerDocument;
    this.win = this.doc.defaultView;
    this.settings = settings;
    this.onError = onError;
    this.disposed = false;
    this.cleanups = [];
    this.textures = [];
    this.shaders = [];
    this.pointer = [0.5, 0.15];
    this.canvas = this.doc.createElement('canvas');
    this.canvas.className = 'frutiger-liquid-glass-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.pointerEvents = 'none';
    try {
      this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
      if (!this.gl) throw new Error('WebGL2 is unavailable. CSS glass remains active.');
      const gl = this.gl;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        this.shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = new Map();
      this.root.prepend(this.canvas);
      this.doc.body.classList.add('frutiger-liquid-glass-active');
      this.listen(this.canvas, 'webglcontextlost', event => {
        event.preventDefault();
        this.fail(new Error('WebGL context lost. CSS glass restored; toggle the effect to retry.'));
      });
      this.listen(this.win, 'resize', () => { this.needsGeometry = true; this.schedule(); });
      this.listen(this.doc, 'visibilitychange', () => this.schedule());
      this.listen(this.doc, 'pointermove', event => {
        const r = this.root.getBoundingClientRect();
        this.pointer = [(event.clientX-r.left)/Math.max(r.width,1), (event.clientY-r.top)/Math.max(r.height,1)];
        this.schedule();
      }, { passive: true });
      this.resizeObserver = new this.win.ResizeObserver(() => { this.needsGeometry = true; this.schedule(); });
      this.resizeObserver.observe(root);
      this.mutationObserver = new this.win.MutationObserver(() => { this.needsGeometry = true; this.schedule(); });
      this.mutationObserver.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      this.needsGeometry = true;
      this.draw();
      if (wallpaperUrl) {
        const image = new this.win.Image();
        this.image = image;
        image.onload = () => {
          if (this.disposed) return;
          this.wallpaper = image;
          this.backdropDirty = true;
          this.schedule();
        };
        image.onerror = () => console.warn('[Frutiger Liquid Glass] Wallpaper unavailable; using generated fallback.');
        image.src = wallpaperUrl;
      }
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  listen(target, event, callback, options) {
    target.addEventListener(event, callback, options);
    this.cleanups.push(() => target.removeEventListener(event, callback, options));
  }
  location(name) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name);
  }
  float(name, value) { this.gl.uniform1f(this.location(name), value); }
  schedule() {
    if (this.disposed || this.timer || this.frame || this.doc.hidden) return;
    // No animation loop: idle uses zero frames; pointer activity is capped at 30 FPS.
    this.timer = this.win.setTimeout(() => {
      this.timer = null;
      this.frame = this.win.requestAnimationFrame(() => {
        this.frame = null;
        if (!this.disposed) { try { this.draw(); } catch (error) { this.fail(error); } }
      });
    }, 34);
  }
  texture(canvas, unit) {
    const gl = this.gl;
    const texture = gl.createTexture();
    this.textures.push(texture);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }
  backdrop() {
    const gl = this.gl;
    for (const texture of this.textures) gl.deleteTexture(texture);
    this.textures = [];
    const image = this.doc.createElement('canvas');
    image.width = this.canvas.width; image.height = this.canvas.height;
    const ctx = image.getContext('2d');
    const w = image.width, h = image.height;
    const sky = ctx.createLinearGradient(0,0,w,h);
    sky.addColorStop(0, '#22b7e8'); sky.addColorStop(0.4,'#c3f3ff');
    sky.addColorStop(0.72,'#48c6dc'); sky.addColorStop(1,'#7cde66');
    ctx.fillStyle = sky; ctx.fillRect(0,0,w,h);
    // Smooth wallpaper ribbons provide real texture detail for edge refraction.
    for (let i=0;i<4;i++) {
      ctx.beginPath(); ctx.moveTo(-w*0.2,h*(0.5+i*0.14));
      ctx.bezierCurveTo(w*0.25,h*(0.15+i*0.2),w*0.6,h*(1.3-i*0.1),w*1.2,h*(0.24+i*0.17));
      ctx.lineWidth = h*(0.02+i*0.015); ctx.strokeStyle = ['#ffffff66','#eaffff66','#1bbadb44','#a6f07966'][i]; ctx.stroke();
    }
    for (const [x,y,r] of [[.12,.24,.13],[.86,.22,.2],[.78,.82,.26]]) {
      const bubble=ctx.createRadialGradient(w*x,h*y,0,w*x,h*y,h*r);
      bubble.addColorStop(0,'#ffffff77'); bubble.addColorStop(.8,'#ffffff08'); bubble.addColorStop(1,'#ffffff00');
      ctx.fillStyle=bubble; ctx.fillRect(0,0,w,h);
    }
    if (this.wallpaper) {
      const image = this.wallpaper;
      const scale = Math.max(w/image.naturalWidth,h/image.naturalHeight);
      const iw=image.naturalWidth*scale, ih=image.naturalHeight*scale;
      const ox=(w-iw)/2, oy=(h-ih)/2;
      ctx.drawImage(image,ox,oy,iw,ih);
      // Behind the reading pane, mirror the exact slice under the sidebar so both
      // show the same deep-blue sky and green field and meet without a seam.
      const split = Math.max(0,Math.min(w,this.wallpaperSplit ?? Math.round(w*0.42)));
      const sx=Math.max(0,-ox/scale), sw=Math.max(1,Math.min(image.naturalWidth,(split-ox)/scale)-sx);
      const sy=Math.max(0,-oy/scale), sh=Math.min(image.naturalHeight-sy,h/scale);
      if (split < w) {
        ctx.save(); ctx.translate(w,0); ctx.scale(-1,1);
        ctx.drawImage(image,sx,sy,sw,sh,0,0,w-split,h);
        ctx.restore();
      }
    }
    this.texture(image,0);
    const blurred = this.doc.createElement('canvas'); blurred.width=w; blurred.height=h;
    const blur = blurred.getContext('2d'); blur.filter='blur(12px)';
    blur.drawImage(image,-24,-24,w+48,h+48);
    this.texture(blurred,1);
    gl.uniform1i(this.location('u_bg'),0); gl.uniform1i(this.location('u_blurredBg'),1);
  }
  geometry() {
    const origin = this.root.getBoundingClientRect();
    const selectors = ['.mod-sidedock.mod-left-split', '.mod-sidedock.mod-right-split', '.workspace-tab-header.is-active', '.mod-root .workspace-leaf-content'];
    const items = [...this.root.querySelectorAll(selectors.join(','))].filter(el => el.getClientRects().length && el.getBoundingClientRect().width > 12).slice(0,16);
    const rectangles = new Float32Array(64), radii = new Float32Array(16);
    items.forEach((el,i) => {
      const r=el.getBoundingClientRect();
      rectangles.set([r.left-origin.left+r.width/2,origin.height-(r.top-origin.top+r.height/2),r.width,r.height],i*4);
      radii[i] = el.classList.contains('workspace-tab-header') ? Math.min(24,r.height/2) : el.classList.contains('workspace-leaf-content') ? 24 : 18;
    });
    this.gl.uniform1i(this.location('u_rectCount'),items.length);
    this.gl.uniform4fv(this.location('u_rects[0]'),rectangles);
    this.gl.uniform1fv(this.location('u_radii[0]'),radii);
    this.surfaceCount = items.length;
    this.needsGeometry = false;
  }
  draw() {
    const gl=this.gl, bounds=this.root.getBoundingClientRect();
    if (bounds.width<1 || bounds.height<1 || this.doc.hidden) return;
    // One physical pixel per CSS pixel, capped at 1920 wide / 1400 high.
    this.scale=Math.min(1,1920/bounds.width,1400/bounds.height);
    const w=Math.max(1,Math.round(bounds.width*this.scale)), h=Math.max(1,Math.round(bounds.height*this.scale));
    const dock=this.root.querySelector('.mod-sidedock.mod-left-split');
    const dockRight=dock ? dock.getBoundingClientRect().right-bounds.left : bounds.width*0.42;
    const split=Math.round(Math.max(0,Math.min(bounds.width,dockRight))*this.scale);
    if (split!==this.wallpaperSplit) {this.wallpaperSplit=split;this.backdropDirty=true;}
    gl.useProgram(this.program);
    if (this.canvas.width!==w || this.canvas.height!==h || !this.textures.length || this.backdropDirty) {
      this.canvas.width=w; this.canvas.height=h; gl.viewport(0,0,w,h);
      this.backdrop(); this.needsGeometry=true; this.backdropDirty=false;
    }
    gl.uniform2f(this.location('u_resolution'),w,h);
    this.float('u_dpr',this.scale);
    gl.uniform2f(this.location('u_mouse'),0,0); gl.uniform2f(this.location('u_mouseSpring'),0,0);
    this.float('u_mergeRate',0); this.float('u_shapeWidth',100); this.float('u_shapeHeight',50);
    this.float('u_shapeRadius',20); this.float('u_shapeRoundness',4);
    gl.uniform4f(this.location('u_tint'),0.87,0.98,1,0.06);
    this.float('u_refThickness',this.settings.thickness);
    this.float('u_refDistance',this.settings.strength);
    this.float('u_refFactor',1.4); this.float('u_refDispersion',this.settings.dispersion);
    this.float('u_refFresnelRange',30); this.float('u_refFresnelFactor',0.25); this.float('u_refFresnelHardness',0.2);
    this.float('u_glareRange',30); this.float('u_glareConvergence',0.5); this.float('u_glareOppositeFactor',0.8);
    this.float('u_glareFactor',this.settings.glare); this.float('u_glareHardness',0.2);
    this.float('u_glareAngle',(this.pointer[0]-0.5)*2+(this.pointer[1]-0.5));
    gl.uniform1i(this.location('u_blurEdge'),0); gl.uniform1i(this.location('u_showShape1'),0); gl.uniform1i(this.location('STEP'),9);
    if (this.needsGeometry) this.geometry();
    gl.drawArrays(gl.TRIANGLES,0,6);
    this.drawCount=(this.drawCount||0)+1;
  }
  fail(error) { this.destroy(); this.onError(error); }
  destroy() {
    if (this.disposed) return;
    this.disposed=true;
    this.win.clearTimeout(this.timer); this.win.cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect(); this.mutationObserver?.disconnect();
    if (this.image) {this.image.onload=null;this.image.onerror=null;}
    for(const cleanup of this.cleanups) cleanup();
    this.cleanups=[];
    this.doc.body.classList.remove('frutiger-liquid-glass-active');
    this.canvas.remove();
    if (this.gl) {
      for(const texture of this.textures) this.gl.deleteTexture(texture);
      if(this.buffer) this.gl.deleteBuffer(this.buffer);
      if(this.program) this.gl.deleteProgram(this.program);
      for(const shader of this.shaders) this.gl.deleteShader(shader);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
}

class GlassSettings extends PluginSettingTab {
  display() {
    const {containerEl}=this; containerEl.empty();
    containerEl.createEl('h2',{text:'Frutiger Liquid Glass'});
    containerEl.createEl('p',{text:'Refracts the local Aero wallpaper through native interface surfaces. Note text stays native. No notes, desktop, or screen captures are sampled.'});
    new Setting(containerEl).setName('Enable shader glass').setDesc('Turn off to restore your CSS glass preset.').addToggle(toggle=>toggle.setValue(this.plugin.settings.enabled).onChange(async value=>{this.plugin.settings.enabled=value;await this.plugin.saveData(this.plugin.settings);this.plugin.restart();}));
    for(const [key,name,min,max,step] of [['strength','Refraction strength',0,0.08,0.005],['thickness','Glass edge thickness',5,50,1],['dispersion','Color dispersion',0,15,0.5],['glare','Reflection brightness',0,1,0.05]]) {
      new Setting(containerEl).setName(name).addSlider(slider=>slider.setLimits(min,max,step).setValue(this.plugin.settings[key]).setDynamicTooltip().onChange(async value=>{this.plugin.settings[key]=value;await this.plugin.saveData(this.plugin.settings);this.plugin.renderer?.schedule();}));
    }
    new Setting(containerEl).setName('Renderer status').setDesc(this.plugin.renderer && !this.plugin.renderer.disposed ? `WebGL2 active · ${this.plugin.renderer.surfaceCount} glass surfaces · no continuous animation` : 'CSS fallback active');
  }
}

module.exports = class FrutigerLiquidGlass extends Plugin {
  async onload() {
    this.settings={...DEFAULTS,...await this.loadData()};
    this.addSettingTab(new GlassSettings(this.app,this));
    this.addCommand({id:'toggle-glass',name:'Toggle shader glass',callback:async()=>{this.settings.enabled=!this.settings.enabled;await this.saveData(this.settings);this.restart();new Notice(this.settings.enabled?'Liquid Glass enabled':'CSS glass restored');}});
    this.registerEvent(this.app.workspace.on('layout-change',()=>{if(this.renderer){this.renderer.needsGeometry=true;this.renderer.schedule();}}));
    this.app.workspace.onLayoutReady(()=>{if(!this.unloaded)this.restart();});
  }
  restart() {
    this.renderer?.destroy(); this.renderer=null;
    if(!this.settings.enabled || this.unloaded) return;
    const root=this.app.workspace.containerEl.closest('.app-container');
    if(!root) return;
    try {this.renderer=new GlassRenderer(root,this.settings,error=>{console.error('[Frutiger Liquid Glass]',error);new Notice(error.message);});}
    catch(error){console.error('[Frutiger Liquid Glass]',error);new Notice('Liquid Glass: '+error.message);}
  }
  onunload(){this.unloaded=true;this.renderer?.destroy();this.renderer=null;}
};
module.exports.GlassRenderer=GlassRenderer;
module.exports.DEFAULTS=DEFAULTS;
