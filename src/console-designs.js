/* DEKA_CONSOLE_DESIGNS_021 · Three complete control surfaces, one live transport. */
(function () {
  'use strict';
  const themes = [
    { id: 'aurora', name: 'Aurora Glass', tag: 'ROTARY', text: 'Круговые ручки EQ и FX, вертикальный рычаг темпа, светящиеся кольца дек.' },
    { id: 'acid', name: 'Acid Terminal', tag: 'LINEAR', text: 'Вертикальные фейдеры частот, полосы эффектов и крупный линейный микшер.' },
    { id: 'editorial', name: 'Editorial Mono', tag: 'PRECISION', text: 'Точные энкодеры: движение вверх / вниз, кнопки − / + и числовые шкалы.' }
  ];
  const css = `
[data-console-theme]{--dc-ink:#f1f5fa;--dc-muted:#8ea8b7;--dc-accent:var(--accent,var(--amber,var(--a)));--dc-metal:#2c3c4a;--dc-dark:#0b1620;--dc-line:#39505f;--dc-field:#0b1722;color:var(--dc-ink)}
[data-console-theme=aurora]{--a:#53dfc9;--b:#b89aff;--amber:#53dfc9;--cyan:#b89aff;--dc-metal:#324858;--dc-dark:#101d29;--dc-line:#3b5364;--dc-field:#0b1823;--dc-ink:#edf5fa;--dc-muted:#9bb2c3;--panel:#182b3a;--bg:#0d1b27;--line:#344b5c}
[data-console-theme=acid]{--a:#d3f34a;--b:#faf3ac;--amber:#d3f34a;--cyan:#faf3ac;--dc-metal:#303628;--dc-dark:#0b0e09;--dc-line:#4a5338;--dc-field:#0c1008;--dc-ink:#edf1df;--dc-muted:#a5ad97;--panel:#151b11;--bg:#090d07;--line:#465332}
[data-console-theme=editorial]{--a:#ba481e;--b:#37578a;--amber:#ba481e;--cyan:#37578a;--dc-metal:#dcd9d0;--dc-dark:#b3afa4;--dc-line:#b8b5aa;--dc-field:#f7f6f0;--dc-ink:#232825;--dc-muted:#6e746c;--panel:#e9e7df;--bg:#d6d7ce;--line:#b0b3a7}
.dc-control{position:relative;display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;align-items:center;gap:3px;min-width:0;--dc-accent:var(--accent,var(--amber,var(--a)));--dc-value:.5;--dc-angle:0deg;--dc-position:50%;color:var(--dc-ink)}
.dc-control>.dc-source{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;opacity:0!important;pointer-events:none!important;margin:0!important;writing-mode:horizontal-tb!important}
.dc-surface{position:relative;display:block;min-width:44px;min-height:44px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;outline:none;border-radius:50%;flex:none}
.dc-surface:focus-visible{outline:2px solid var(--dc-accent);outline-offset:3px}.dc-dragging .dc-surface{cursor:grabbing}
.dc-disabled{opacity:.42}.dc-disabled .dc-surface{cursor:default}.dc-value{font:600 10px/1.3 Consolas,monospace;font-variant-numeric:tabular-nums;color:var(--dc-accent);white-space:nowrap;pointer-events:none}
.dc-control .dc-step{display:none;touch-action:manipulation;min-width:24px;min-height:28px;padding:0;border:1px solid var(--dc-line);border-radius:5px;background:var(--dc-field);color:var(--dc-ink);font-size:17px}
.dc-control[data-kind=rotary] .dc-surface,.dc-control[data-kind=encoder] .dc-surface{width:60px;height:60px}
.dc-control .dc-scale{position:absolute;inset:0;border-radius:inherit;background:repeating-conic-gradient(from -135deg,var(--dc-line) 0 1.5deg,transparent 1.5deg 13.5deg);mask:radial-gradient(circle,transparent 60%,#000 62%);-webkit-mask:radial-gradient(circle,transparent 60%,#000 62%)}
.dc-control .dc-track{position:absolute;inset:5px;border-radius:50%;background:conic-gradient(from 225deg,var(--dc-accent) 0deg calc(var(--dc-value)*270deg),var(--dc-line) calc(var(--dc-value)*270deg) 270deg,transparent 270deg);mask:radial-gradient(circle,transparent 62%,#000 65%);-webkit-mask:radial-gradient(circle,transparent 62%,#000 65%)}
.dc-control .dc-cap{position:absolute;inset:11px;border-radius:50%;border:1px solid #ffffff22;background:linear-gradient(145deg,var(--dc-metal),var(--dc-dark));box-shadow:inset 0 1px 1px #ffffff30,0 3px 6px #0007;transform:rotate(var(--dc-angle));pointer-events:none}
.dc-control .dc-cap i{position:absolute;top:3px;left:calc(50% - 1px);width:2px;height:9px;background:var(--dc-accent);border-radius:1px;box-shadow:0 0 5px color-mix(in srgb,var(--dc-accent) 40%,transparent)}
.dc-control[data-role=fx][data-kind=rotary] .dc-surface{width:44px;height:44px}.dc-control[data-role=fx] .dc-cap{inset:8px}.dc-control[data-role=fx] .dc-cap i{height:6px}
.dc-control[data-kind=vertical] .dc-surface{width:44px;height:112px;border-radius:4px}
.dc-control[data-kind=vertical] .dc-scale{inset:12px 4px;border-radius:0;background:repeating-linear-gradient(to top,var(--dc-line) 0 1px,transparent 1px 10%);mask:none;-webkit-mask:none}
.dc-control[data-kind=vertical] .dc-track{inset:14px 18px;border-radius:4px;background:linear-gradient(to top,var(--dc-accent) var(--dc-position),var(--dc-dark) var(--dc-position));mask:none;-webkit-mask:none;box-shadow:inset 0 1px 3px #0008;border:1px solid var(--dc-line)}
.dc-control[data-kind=vertical] .dc-cap{inset:auto;left:6px;top:calc(100% - 26px - var(--dc-value)*(100% - 28px));width:32px;height:24px;border-radius:4px;transform:none;background:linear-gradient(var(--dc-metal),var(--dc-dark));box-shadow:0 3px 5px #0007,inset 0 1px #ffffff4d}
.dc-control[data-kind=vertical] .dc-cap i{left:3px;right:3px;top:10px;width:auto;height:2px}
.dc-control[data-kind=horizontal],.dc-control[data-kind=strip]{width:100%}
.dc-control[data-kind=horizontal] .dc-surface,.dc-control[data-kind=strip] .dc-surface{width:100%;height:44px;border-radius:5px}
.dc-control[data-kind=horizontal] .dc-scale,.dc-control[data-kind=strip] .dc-scale{inset:5px 14px;background:repeating-linear-gradient(to right,var(--dc-line) 0 1px,transparent 1px 10%);border-radius:0;mask:none;-webkit-mask:none}
.dc-control[data-kind=horizontal] .dc-track,.dc-control[data-kind=strip] .dc-track{inset:18px 14px;border-radius:4px;background:linear-gradient(to right,var(--dc-accent) var(--dc-position),var(--dc-dark) var(--dc-position));mask:none;-webkit-mask:none;box-shadow:inset 0 1px 4px #0008}
.dc-control[data-kind=horizontal] .dc-cap,.dc-control[data-kind=strip] .dc-cap{inset:auto;top:7px;left:calc(2px + var(--dc-value)*(100% - 28px));width:24px;height:30px;border-radius:4px;transform:none}
.dc-control[data-kind=horizontal] .dc-cap i,.dc-control[data-kind=strip] .dc-cap i{top:4px;bottom:4px;height:auto;width:2px;left:10px}
.dc-control[data-kind=strip] .dc-cap{width:12px;left:calc(8px + var(--dc-value)*(100% - 28px));border-radius:2px;background:var(--dc-accent);box-shadow:0 0 7px #0008}.dc-control[data-kind=strip] .dc-cap i{display:none}
.dc-control[data-kind=encoder]{grid-template-columns:24px minmax(44px,60px) 24px;justify-content:center;gap:2px}.dc-control[data-kind=encoder]>.dc-step{display:block}.dc-control[data-kind=encoder]>.dc-value{grid-column:1/-1}
.dc-control[data-kind=encoder] .dc-cap{background:repeating-conic-gradient(#aaa79b 0deg 5deg,#dedbd0 5deg 10deg);box-shadow:0 2px 4px #0003,inset 0 0 0 5px #d8d6cc}.dc-control[data-kind=encoder] .dc-cap i{background:var(--dc-ink);box-shadow:none}
.dc-control[data-control-theme=editorial][data-role=fx]{grid-template-columns:24px minmax(32px,1fr) 24px;gap:1px}.dc-control[data-control-theme=editorial][data-role=fx]>.dc-step{display:block}.dc-control[data-control-theme=editorial][data-role=fx]>.dc-value{grid-column:1/-1}
.dc-control[data-role=cross] .dc-value{letter-spacing:.2em}.dc-control[data-role=tempo][data-kind=vertical] .dc-surface{height:170px}

/* Desktop hardware: the parts stay mounted while their arrangement changes. */
#desktopDJ[data-console-platform]{overflow:hidden;border-radius:18px;background:linear-gradient(135deg,var(--panel),var(--bg));border:1px solid var(--dc-line);box-shadow:0 18px 45px #0005,inset 0 1px #ffffff12}
#desktopDJ[data-console-platform] .bar{background:linear-gradient(#ffffff08,transparent);padding:13px 18px}
#desktopDJ[data-console-platform] .brand{letter-spacing:.18em;font-size:22px;color:var(--dc-ink)}
#desktopDJ[data-console-platform] .dj-view-label{font-family:Consolas,monospace;text-transform:uppercase;letter-spacing:.1em;font-size:10px}
#desktopDJ[data-console-platform] .dj-intro{font-family:Consolas,monospace;font-size:9px;letter-spacing:.06em;color:var(--dc-muted);border-color:var(--dc-line)}
#desktopDJ[data-console-platform] .dj-console{grid-template-columns:48px minmax(0,1fr) 128px minmax(0,1fr) 48px;gap:10px;padding:16px}
#desktopDJ[data-console-platform] .dj-deck{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 66px;grid-template-areas:'head head' 'track track' 'platter tempo' 'position position' 'transport transport' 'eq eq' 'fx fx' 'meter meter';gap:8px;padding:14px;background:linear-gradient(150deg,#ffffff08,transparent 50%),var(--panel);border:1px solid var(--dc-line);border-radius:14px;box-shadow:inset 0 1px #ffffff12,0 8px 18px #0002}
#desktopDJ[data-console-platform] .dj-deck h2{grid-area:head;margin:0;font:700 11px/1.5 Consolas,monospace;letter-spacing:.16em;color:var(--accent)}
#desktopDJ[data-console-platform] .dj-track{grid-area:track;min-height:48px;padding:9px 12px;background:var(--dc-field);border-color:var(--dc-line);border-radius:7px;box-shadow:inset 0 2px 5px #0003}
#desktopDJ[data-console-platform] .dj-track b{font-size:14px;color:var(--dc-ink)}
#desktopDJ[data-console-platform] .dj-platter{grid-area:platter;position:relative;align-self:center;text-align:center;min-width:0}
#desktopDJ[data-console-platform] .dj-disc{width:178px;height:178px;margin:8px auto;border:7px solid var(--dc-metal);outline:1px solid var(--dc-line);background:repeating-radial-gradient(circle,#111923 0 3px,#24303b 4px 5px);box-shadow:0 0 0 2px var(--dc-dark),0 0 0 4px var(--accent),0 12px 20px #0008,inset 0 0 0 4px #000}
#desktopDJ[data-console-platform] .dj-disc span{background:radial-gradient(circle,var(--dc-dark) 0 29%,transparent 30%);font-size:27px;color:var(--accent)}
#desktopDJ[data-console-platform] .dj-disc span:after{top:9px;height:16px;width:3px;border-radius:2px;background:var(--accent)}
#desktopDJ[data-console-platform] .dj-vinyl-help{font:9px/1.3 Consolas,monospace;color:var(--dc-muted);margin:5px 0 0}
#desktopDJ[data-console-platform] .dj-position{grid-area:position;min-width:0}.dj-position .dj-times{font-size:10px}
#desktopDJ[data-console-platform] .dj-transport{grid-area:transport;margin:0;gap:5px;flex-wrap:wrap}
#desktopDJ[data-console-platform] .dj-transport .btn{min-height:34px;height:34px;border-radius:6px}
#desktopDJ[data-console-platform] .dj-transport .play{flex:1;min-width:90px;font-size:11px;font-weight:700;box-shadow:0 3px 0 #0003}
#desktopDJ[data-console-platform] .dj-effective{font-size:10px;min-width:64px}
#desktopDJ[data-console-platform] .dj-cuefx{grid-area:fx;display:grid;grid-template-columns:62px minmax(0,1fr);gap:10px;min-width:0}
#desktopDJ[data-console-platform] .dj-fx{padding:8px;gap:6px;background:var(--dc-field);border:1px solid var(--dc-line);border-radius:9px}
#desktopDJ[data-console-platform] .dj-fx-cell{min-width:0}.dj-fx-cell>.dc-control{margin-top:4px}
#desktopDJ[data-console-platform] .dj-fx .btn{min-height:25px;font-size:9px;border-radius:5px;background:var(--panel)}
#desktopDJ[data-console-platform] .dj-eq{grid-area:eq;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:8px 0 0;margin:0;border-top:1px solid var(--dc-line)}
#desktopDJ[data-console-platform] .dj-eq>label{font:10px/1.4 Consolas,monospace;text-align:center;color:var(--dc-muted);min-width:0}
#desktopDJ[data-console-platform] .dj-deck>.dj-label{grid-area:tempo;min-width:0;margin:0;align-self:center;text-align:center}
#desktopDJ[data-console-platform] .dj-rate-heading{flex-wrap:wrap;justify-content:center;gap:5px;font-size:10px}
#desktopDJ[data-console-platform] .dj-rate-heading output{display:none}#desktopDJ[data-console-platform] .dj-rate-reset{min-height:22px;min-width:35px;padding:1px 4px;font-size:10px}
#desktopDJ[data-console-platform] .dj-deck>meter{grid-area:meter;width:100%;height:6px;margin:0}
#desktopDJ[data-console-platform] .dj-mixer{padding:10px 6px;gap:12px;background:linear-gradient(90deg,#0002,transparent,#0002);border-inline:1px solid var(--dc-line);border-radius:8px;min-width:0}
#desktopDJ[data-console-platform] .dj-mixer>label{width:100%;font:9px Consolas,monospace;letter-spacing:.1em;color:var(--dc-muted);text-align:center}
#desktopDJ[data-console-platform] .dj-mixer>small:not(#djAutoState){display:none}
#desktopDJ[data-console-platform] .dj-cross{width:100%;margin:0;padding:10px 0;border-color:var(--dc-line);text-align:center}
#desktopDJ[data-console-platform] .dj-cross>b{font:9px Consolas,monospace;letter-spacing:.15em}#desktopDJ[data-console-platform] #djCenter{min-height:26px;padding:2px 7px;font-size:10px}
#desktopDJ[data-console-platform] .dj-brake{gap:7px;justify-content:center}#desktopDJ[data-console-platform] .dj-brake .btn{min-height:50px;border-radius:7px;background:linear-gradient(var(--panel),var(--bg));box-shadow:0 3px #0003;font-size:8px;padding:3px}
#desktopDJ[data-console-platform] .dj-brake>strong{display:none}#desktopDJ[data-console-platform] .dj-brake>b{font-size:8px;letter-spacing:.07em}#desktopDJ[data-console-platform] .dj-brake>small{font-size:8px}
#desktopDJ[data-console-platform] .btn{transition:background .1s,border-color .1s;background:var(--panel);border-color:var(--dc-line);color:var(--dc-ink)}
#desktopDJ[data-console-platform] .btn:hover{border-color:var(--amber);background:color-mix(in srgb,var(--panel),var(--amber) 9%)}
#desktopDJ[data-console-platform] .toggle[aria-pressed=true]{background:color-mix(in srgb,var(--panel),var(--accent,var(--amber)) 18%);border-color:var(--accent,var(--amber));color:var(--accent,var(--amber));box-shadow:inset 0 -2px var(--accent,var(--amber))}
#desktopDJ[data-console-platform] .dj-library{background:var(--bg);padding:14px 18px}#desktopDJ[data-console-platform] #djMessage{background:var(--dc-field);color:var(--dc-muted);border-color:var(--dc-line)}
#desktopDJ[data-console-platform] input[type=search],#desktopDJ[data-console-platform] select{background:var(--dc-field);color:var(--dc-ink);border-color:var(--dc-line)}
#desktopDJ[data-console-platform] .dj-row{border-color:var(--dc-line)}#desktopDJ[data-console-platform] .dj-row:hover{background:var(--panel)}

#desktopDJ[data-console-theme=acid]{border-radius:3px;font-family:Consolas,monospace;box-shadow:0 0 0 5px #080b05,0 18px 40px #0007}
#desktopDJ[data-console-theme=acid] .bar{border-bottom:2px solid var(--amber)}
#desktopDJ[data-console-theme=acid] .dj-deck{grid-template-columns:minmax(0,1fr) 130px;grid-template-areas:'head head' 'track track' 'platter eq' 'position position' 'tempo tempo' 'transport transport' 'fx fx' 'meter meter';border-radius:3px;background:repeating-linear-gradient(0deg,#ffffff02 0 1px,transparent 1px 4px),var(--panel)}
#desktopDJ[data-console-theme=acid] .dj-eq{grid-template-columns:repeat(3,minmax(0,1fr));border:0;gap:0;padding:0;align-self:center}
#desktopDJ[data-console-theme=acid] .dj-eq .dc-surface{height:160px;min-width:34px;width:34px}#desktopDJ[data-console-theme=acid] .dj-eq .dc-cap{left:1px}
#desktopDJ[data-console-theme=acid] .dj-disc{width:160px;height:160px;border-radius:50%;border-color:#373c2e;outline:3px solid #080b06;box-shadow:0 0 0 5px var(--dc-line),0 0 0 6px #000,0 9px 0 #0006}
#desktopDJ[data-console-theme=acid] .dj-platter{padding:8px;border:1px solid var(--dc-line);background:#080b06;border-radius:2px}
#desktopDJ[data-console-theme=acid] .dj-fx .btn,#desktopDJ[data-console-theme=acid] .dj-track{border-radius:2px}#desktopDJ[data-console-theme=acid] .dj-fx{border-radius:2px;padding:6px}
#desktopDJ[data-console-theme=acid] .dj-rate-heading{justify-content:space-between}#desktopDJ[data-console-theme=acid] .dj-rate-reset{margin-left:auto}
#desktopDJ[data-console-theme=acid] .dj-deck>.dj-label .dc-control{grid-template-columns:1fr 48px}.dc-control[data-control-theme=acid][data-role=tempo] .dc-value{font-size:11px}

#desktopDJ[data-console-theme=editorial]{border-radius:10px;background:var(--panel);box-shadow:0 18px 40px #20241a25,inset 0 1px #fff}
#desktopDJ[data-console-theme=editorial] .bar{border-bottom:2px solid var(--dc-ink)}
#desktopDJ[data-console-theme=editorial] .brand{font-family:'Arial Black',Arial,sans-serif;font-size:26px;letter-spacing:-.03em}
#desktopDJ[data-console-theme=editorial] .dj-deck{grid-template-columns:minmax(0,1fr) 120px;grid-template-areas:'head head' 'track track' 'platter eq' 'position position' 'tempo tempo' 'transport transport' 'fx fx' 'meter meter';background:linear-gradient(120deg,#f6f5ee,#e2e1d7);border:1px solid #b0b3a7;border-radius:7px;box-shadow:inset 0 1px #fff,0 6px 10px #20241a15}
#desktopDJ[data-console-theme=editorial] .dj-eq{grid-template-columns:1fr;padding:0;border:0;gap:2px;align-self:center}#desktopDJ[data-console-theme=editorial] .dj-eq>label{display:grid;grid-template-columns:1fr;font-size:8px}
#desktopDJ[data-console-theme=editorial] .dj-eq .dc-surface{width:44px;height:44px}.dc-control[data-control-theme=editorial] .dc-cap{border-color:#fff9}
#desktopDJ[data-console-theme=editorial] .dj-disc{width:172px;height:172px;border:8px solid #c2c4ba;outline:1px solid #969c8e;box-shadow:0 0 0 4px #f9f8f0,0 10px 14px #20241a3b;--disc:#191d1d}
#desktopDJ[data-console-theme=editorial] .dj-disc span{background:radial-gradient(circle,#e8e5d8 0 29%,transparent 30%);color:#242c29}
#desktopDJ[data-console-theme=editorial] .dj-deck>.dj-label .dc-control{grid-template-columns:1fr 50px}#desktopDJ[data-console-theme=editorial] .dj-rate-heading{justify-content:space-between}
#desktopDJ[data-console-theme=editorial] .btn{background:linear-gradient(#fbfaf5,#e4e1d5);border-color:#acae9f;color:#343b32;box-shadow:0 2px 0 #bfc1b4}
#desktopDJ[data-console-theme=editorial] .dj-fx{padding:7px;background:#d7d9ce;border-color:#b9bdaf}#desktopDJ[data-console-theme=editorial] .dj-fx .btn{border-radius:3px;background:#f4f1e8}
#desktopDJ[data-console-theme=editorial] .dj-fx .dc-control{grid-template-columns:20px minmax(24px,1fr) 20px}.dc-control[data-control-theme=editorial][data-role=fx] .dc-step{min-width:20px;font-size:14px}

#desktopDJ[data-console-platform].dj-compact .dj-console{grid-template-columns:minmax(0,1fr) 128px minmax(0,1fr)}
#desktopDJ[data-console-platform].dj-compact .dj-deck{grid-template-columns:1fr;grid-template-areas:'head' 'track' 'position' 'transport' 'eq' 'meter';align-content:start;gap:10px}
#desktopDJ[data-console-platform].dj-compact .dj-platter{display:none}#desktopDJ[data-console-platform].dj-compact .dj-eq{grid-template-columns:repeat(3,minmax(0,1fr));border:0}
#desktopDJ[data-console-platform].dj-compact .dj-eq .dc-surface{height:60px}#desktopDJ[data-console-theme=acid].dj-compact .dj-eq .dc-surface{height:90px}
#desktopDJ[data-console-platform].dj-compact .dj-cuefx,#desktopDJ[data-console-platform].dj-compact .dj-deck>.dj-label{display:none}
@media(max-width:1200px){#desktopDJ[data-console-platform] .dj-console{grid-template-columns:40px minmax(0,1fr) 110px minmax(0,1fr) 40px;gap:6px;padding:10px}#desktopDJ[data-console-platform] .dj-deck{padding:9px;gap:6px}#desktopDJ[data-console-platform] .dj-disc{width:140px;height:140px}#desktopDJ[data-console-theme=acid] .dj-deck{grid-template-columns:minmax(0,1fr) 110px}#desktopDJ[data-console-theme=editorial] .dj-deck{grid-template-columns:minmax(0,1fr) 104px}#desktopDJ[data-console-platform] .dj-cuefx{grid-template-columns:50px minmax(0,1fr);gap:5px}#desktopDJ[data-console-platform] .dj-fx{padding:4px;gap:3px}}
@media(min-width:761px) and (max-height:850px){#desktopDJ[data-console-platform] .bar{padding:7px 12px}#desktopDJ[data-console-platform] .dj-intro{padding:3px 12px}#desktopDJ[data-console-platform] .dj-console{padding-block:8px}#desktopDJ[data-console-platform] .dj-deck{gap:4px;padding:8px}#desktopDJ[data-console-platform] .dj-track{min-height:38px;padding:5px 8px}#desktopDJ[data-console-platform] .dj-track b{font-size:12px}#desktopDJ[data-console-platform] .dj-disc{width:110px;height:110px;margin:5px auto;border-width:5px}#desktopDJ[data-console-platform] .dj-vinyl-help{font-size:8px;margin:3px 0}#desktopDJ[data-console-platform] .dc-control[data-role=tempo][data-kind=vertical] .dc-surface{height:110px}#desktopDJ[data-console-platform] .dc-control[data-role=eq][data-kind=rotary] .dc-surface{width:46px;height:46px}#desktopDJ[data-console-platform] .dj-eq{padding-top:4px}#desktopDJ[data-console-platform] .dj-fx .dc-surface{height:36px;min-height:36px}#desktopDJ[data-console-platform] .dj-fx .dc-value{font-size:8px}#desktopDJ[data-console-theme=acid] .dj-eq .dc-surface{height:100px}#desktopDJ[data-console-theme=editorial] .dj-eq .dc-surface{height:36px;min-height:36px;width:36px;min-width:36px}#desktopDJ[data-console-theme=editorial] .dj-eq .dc-value{font-size:8px}#desktopDJ[data-console-platform] .dj-transport .btn{height:28px;min-height:28px}#desktopDJ[data-console-platform] .dj-cue .btn{min-height:27px}#desktopDJ[data-console-platform] .dj-fx .btn{min-height:22px}#desktopDJ[data-console-platform] .dj-fx-cell>.dc-control{margin-top:2px}#desktopDJ[data-console-platform] .dj-cuefx{gap:5px}#desktopDJ[data-console-platform] .dj-mixer{gap:7px}#desktopDJ[data-console-platform] .dj-mixer .dc-surface{max-height:90px}}
@media(max-width:760px){#desktopDJ[data-console-platform] .dj-console,#desktopDJ[data-console-platform].dj-compact .dj-console{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}#desktopDJ[data-console-platform] .dj-brake{display:none}#desktopDJ[data-console-platform] .dj-mixer{grid-column:1/-1;order:5;display:grid;grid-template-columns:1fr 1fr 1fr}#desktopDJ[data-console-platform] .dj-deck{grid-template-columns:1fr;grid-template-areas:'head' 'track' 'platter' 'position' 'transport' 'tempo' 'eq' 'fx' 'meter'}#desktopDJ[data-console-platform] .dj-eq{grid-template-columns:repeat(3,minmax(0,1fr))}#desktopDJ[data-console-platform] .dj-cuefx{grid-template-columns:1fr}#desktopDJ[data-console-platform] .dj-cue{flex-direction:row}#desktopDJ[data-console-platform] .dc-control[data-role=tempo] .dc-surface{height:90px}#desktopDJ[data-console-theme=editorial] .dj-eq .dc-control{grid-template-columns:1fr}#desktopDJ[data-console-theme=editorial] .dj-eq .dc-step{display:none}}
@media(max-width:480px){#desktopDJ[data-console-platform] .dj-console,#desktopDJ[data-console-platform].dj-compact .dj-console{grid-template-columns:1fr}#desktopDJ[data-console-platform] .dj-mixer{grid-template-columns:1fr 1fr}#desktopDJ[data-console-platform] .dj-deck[data-side=B]{order:3}}

/* Short desktop windows keep the complete transport and effects in reach. */
@media(min-width:761px) and (max-height:760px){
 #desktopDJ[data-console-platform] .dj-deck{gap:2px;padding:6px}
 #desktopDJ[data-console-platform] .dj-track{min-height:34px;padding:4px 7px}
 #desktopDJ[data-console-platform] .dj-rate-heading{font-size:9px;gap:2px;flex-wrap:nowrap}
 #desktopDJ[data-console-platform] .dc-control[data-role=tempo][data-kind=vertical] .dc-surface{height:88px}
 #desktopDJ[data-console-platform] .dj-disc{width:100px;height:100px;margin:3px auto}
 #desktopDJ[data-console-platform] .dj-eq{padding-top:2px}
 #desktopDJ[data-console-platform] .dc-control[data-role=eq][data-kind=rotary] .dc-surface{width:38px;height:38px;min-width:38px;min-height:38px}
 #desktopDJ[data-console-platform] .dj-fx .btn{height:20px;min-height:20px;font-size:8px;padding-inline:1px}
 #desktopDJ[data-console-platform] .dj-fx .dc-surface{width:32px;min-width:32px;height:28px;min-height:28px}
 #desktopDJ[data-console-platform] .dj-fx .dc-control{gap:1px}
 #desktopDJ[data-console-platform] .dj-fx .dc-cap{inset:5px}
 #desktopDJ[data-console-platform] .dj-fx .dc-value{font-size:8px;line-height:1}
 #desktopDJ[data-console-platform] .dj-fx{padding:3px;gap:2px}
 #desktopDJ[data-console-platform] .dj-fx-cell>.dc-control{margin-top:1px}
 #desktopDJ[data-console-platform] .dj-fx .dc-control[data-kind=strip] .dc-surface{width:100%}
 #desktopDJ[data-console-platform] .dj-fx .dc-control[data-kind=strip] .dc-cap{inset:4px auto auto;left:calc(8px + var(--dc-value)*(100% - 28px));height:20px;width:12px}
 #desktopDJ[data-console-theme=acid] .dj-eq .dc-surface{height:84px}
 #desktopDJ[data-console-theme=editorial] .dj-eq .dc-surface{width:32px;height:32px;min-width:32px;min-height:32px}
}

/* Android uses the same mechanics in its isolated shadow tree. */
.app[data-console-platform=mobile]{background:var(--bg);color:var(--dc-ink)}
.app[data-console-platform=mobile] header{background:var(--panel);border-color:var(--line)}.app[data-console-platform=mobile] .brand{font-size:16px;letter-spacing:.17em}
.app[data-console-platform=mobile] button{touch-action:manipulation;color:var(--dc-ink);border-color:var(--line);background:var(--panel);box-shadow:inset 0 1px #ffffff12}
.app[data-console-platform=mobile] button[aria-pressed=true],.app[data-console-platform=mobile] button[aria-selected=true]{color:var(--accent,var(--a));border-color:var(--accent,var(--a));background:color-mix(in srgb,var(--panel),var(--accent,var(--a)) 15%)}
.app[data-console-platform=mobile] .dj{background:var(--bg)}.app[data-console-platform=mobile] .djinfo{padding:4px 8px;background:var(--dc-field);gap:6px;min-height:46px}
.app[data-console-platform=mobile] .djinfo>.dc-control{flex:1;min-width:100px;max-width:260px;grid-template-columns:1fr 35px;gap:2px}.app[data-console-platform=mobile] .djinfo>.dc-control .dc-surface{height:36px;min-height:36px}
.app[data-console-platform=mobile] .console{gap:7px;padding:7px;grid-template-columns:minmax(0,1fr) 106px minmax(0,1fr);align-items:start}
.app[data-console-platform=mobile] .deck{position:relative;grid-template-columns:54px minmax(110px,1fr) minmax(148px,1.05fr);grid-template-rows:25px minmax(285px,1fr) 44px;min-height:370px;background:linear-gradient(135deg,#ffffff06,transparent),var(--panel);border-color:var(--dc-line);border-radius:13px;padding:6px;gap:5px}
.app[data-console-platform=mobile] .deck[data-side=B]{grid-template-columns:minmax(148px,1.05fr) minmax(110px,1fr) 54px}
.app[data-console-platform=mobile] .deck h2{color:var(--accent);font-family:Consolas,monospace;letter-spacing:.1em}.app[data-console-platform=mobile] .deck h2 small{color:var(--dc-muted);letter-spacing:0}
.app[data-console-platform=mobile] .deckhead{justify-content:space-evenly;gap:7px}.app[data-console-platform=mobile] .decktitle{padding:8px 4px;background:var(--dc-field);border:1px solid var(--dc-line);border-radius:6px}.app[data-console-platform=mobile] .decktitle small{color:var(--dc-muted)}
.app[data-console-platform=mobile] .disc{touch-action:none;width:clamp(110px,16vw,172px);border:6px solid var(--dc-metal);outline:2px solid var(--accent);outline-offset:2px;box-shadow:0 7px 12px #0007}.app[data-console-platform=mobile] .disc span{background:radial-gradient(circle,var(--dc-dark) 0 28%,transparent 29%),repeating-radial-gradient(circle,#121b23 0 3px,#26343e 4px 5px)}
.app[data-console-platform=mobile] .eqrail{gap:12px}.app[data-console-platform=mobile] .eqrail label{font:9px Consolas,monospace;color:var(--dc-muted)}.app[data-console-platform=mobile] .eqrail label>output{display:none}
.app[data-console-platform=mobile] .eqrail .dc-surface{width:50px;height:50px}.app[data-console-platform=mobile] .eqrail .dc-value{font-size:9px}
.app[data-console-platform=mobile] .deckcontrol{gap:7px}.app[data-console-platform=mobile] .deckTabs button{min-height:32px;font-size:10px}
.app[data-console-platform=mobile] .deckpanel{min-height:94px}.app[data-console-platform=mobile] .fxblock{gap:5px;background:var(--dc-field);border:1px solid var(--dc-line);border-radius:7px;padding:5px}.app[data-console-platform=mobile] .fxcell button{min-height:30px;font-size:9px;padding:2px 1px}.app[data-console-platform=mobile] .fxcell .dc-value{font-size:8px}.app[data-console-platform=mobile] .fxcell .dc-surface{min-height:44px;height:44px}
.app[data-console-platform=mobile] .reverseblock button{min-height:36px;background:linear-gradient(var(--dc-metal),var(--dc-dark));color:var(--dc-ink)}.app[data-console-platform=mobile] .decktransport button{min-height:42px;border-radius:7px;box-shadow:0 3px #0003}
.app[data-console-platform=mobile] .mixer{background:var(--dc-field);border:1px solid var(--dc-line);border-radius:9px;gap:10px;padding:8px 5px;overflow:visible;min-height:360px}.app[data-console-platform=mobile] .mixer label{color:var(--dc-muted)}.app[data-console-platform=mobile] .mixer .pair{gap:6px}.app[data-console-platform=mobile] .mixer .dc-control[data-role=gain] .dc-surface{height:112px}.app[data-console-platform=mobile] .mixer button{min-height:36px;width:100%;font-size:11px}.app[data-console-platform=mobile] .mixer .dc-value{font-size:9px}
.app[data-console-platform=mobile] .perform input[type=number],.app[data-console-platform=mobile] input[type=search],.app[data-console-platform=mobile] select{background:var(--dc-field);color:var(--dc-ink);border-color:var(--dc-line)}.app[data-console-platform=mobile] .perform output,.app[data-console-platform=mobile] .count,.app[data-console-platform=mobile] .eqsummary,.app[data-console-platform=mobile] .trackmeta small,.app[data-console-platform=mobile] .decktitle small{color:var(--dc-muted)}
.app[data-console-platform=mobile] .perform .dc-control[data-role=tempo] .dc-surface{height:120px}.app[data-console-platform=mobile] .perform-buttons{flex-wrap:wrap}.app[data-console-platform=mobile] .perform .dc-control[data-kind=horizontal] .dc-surface{height:44px}
.app[data-console-platform=mobile] .vlrow{color:var(--dc-ink);border-color:var(--dc-line)}.app[data-console-platform=mobile] .vlrow.selected{color:var(--accent,var(--a));background:color-mix(in srgb,var(--panel),var(--accent,var(--a)) 12%)}
.app[data-console-theme=acid]{font-family:Consolas,monospace}.app[data-console-theme=acid] .deck{border-radius:3px;grid-template-columns:76px minmax(110px,1fr) minmax(148px,1.05fr)}.app[data-console-theme=acid] .deck[data-side=B]{grid-template-columns:minmax(148px,1.05fr) minmax(110px,1fr) 76px}
.app[data-console-theme=acid] .eqrail{flex-direction:row;gap:0}.app[data-console-theme=acid] .eqrail .dc-surface{width:34px;min-width:34px;height:180px}.app[data-console-theme=acid] .eqrail .dc-cap{left:1px}.app[data-console-theme=acid] .disc{border-color:#404734;outline:1px solid var(--dc-line);outline-offset:4px;box-shadow:0 9px #0007}.app[data-console-theme=acid] .deckhead{background:#070b05;border:1px solid var(--dc-line);border-radius:3px;padding:6px}.app[data-console-theme=acid] .fxblock{border-radius:2px}.app[data-console-theme=acid] .fxcell button{border-radius:2px}
.app[data-console-theme=editorial] .brand{font-family:'Arial Black',Arial,sans-serif;letter-spacing:-.03em;font-size:20px;color:var(--dc-ink)}.app[data-console-theme=editorial] .deck{background:linear-gradient(135deg,#f5f3e9,#ddded3);grid-template-columns:110px minmax(110px,1fr) minmax(152px,1.05fr);border-radius:7px;box-shadow:0 4px 12px #333b201a}.app[data-console-theme=editorial] .deck[data-side=B]{grid-template-columns:minmax(152px,1.05fr) minmax(110px,1fr) 110px}
.app[data-console-theme=editorial] .eqrail .dc-surface{width:44px;height:44px}.app[data-console-theme=editorial] .disc{border-color:#b7beb0;outline-color:#e9e9de;box-shadow:0 8px 10px #313b2140}.app[data-console-theme=editorial] .disc span{background:radial-gradient(circle,#e9e7da 0 28%,transparent 29%),repeating-radial-gradient(circle,#19201d 0 3px,#303730 4px 5px);color:#20271e}.app[data-console-theme=editorial] button{background:linear-gradient(#faf8ef,#e2e1d5);color:var(--dc-ink)}.app[data-console-theme=editorial] .reverseblock button{background:linear-gradient(#e4e5d9,#bcc2b1)}.app[data-console-theme=editorial] .fxblock{background:#d2d7c7}.app[data-console-theme=editorial] .fxcell .dc-control{grid-template-columns:20px minmax(24px,1fr) 20px}
@media(max-width:1100px){.app[data-console-platform=mobile] .console{grid-template-columns:minmax(0,1fr) 88px minmax(0,1fr);gap:5px;padding:5px}.app[data-console-platform=mobile] .deck,.app[data-console-platform=mobile] .deck[data-side=B]{grid-template-columns:52px minmax(0,1fr);grid-template-rows:25px 214px auto 44px;min-height:530px}.app[data-console-platform=mobile] .deck h2{grid-row:1;grid-column:1/-1}.app[data-console-platform=mobile] .eqrail,.app[data-console-platform=mobile] .deck[data-side=B] .eqrail{grid-column:1;grid-row:2}.app[data-console-platform=mobile] .deckhead{grid-column:2;grid-row:2}.app[data-console-platform=mobile] .deckcontrol,.app[data-console-platform=mobile] .deck[data-side=B] .deckcontrol{grid-column:1/-1;grid-row:3}.app[data-console-platform=mobile] .decktransport{grid-row:4}.app[data-console-platform=mobile] .disc{touch-action:none;width:clamp(112px,20vw,148px)}.app[data-console-platform=mobile] .deckpanel{min-height:120px}.app[data-console-theme=acid] .deck,.app[data-console-theme=acid] .deck[data-side=B]{grid-template-columns:72px minmax(0,1fr)}.app[data-console-theme=editorial] .deck,.app[data-console-theme=editorial] .deck[data-side=B]{grid-template-columns:1fr;grid-template-rows:25px 210px 86px auto 44px}.app[data-console-theme=editorial] .deckhead{grid-column:1}.app[data-console-theme=editorial] .eqrail,.app[data-console-theme=editorial] .deck[data-side=B] .eqrail{grid-column:1;grid-row:3;flex-direction:row;justify-content:center;gap:8px}.app[data-console-theme=editorial] .deckcontrol,.app[data-console-theme=editorial] .deck[data-side=B] .deckcontrol{grid-row:4}.app[data-console-theme=editorial] .decktransport{grid-row:5}.app[data-console-theme=editorial] .eqrail .dc-control{grid-template-columns:22px 44px 22px}.app[data-console-theme=editorial] .mixer .dc-control[data-role=master]{grid-template-columns:1fr}.app[data-console-theme=editorial] .mixer .dc-step{display:none}}
@media(orientation:portrait),(max-width:720px){.app[data-console-platform=mobile] .console{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:max-content max-content max-content;grid-auto-rows:max-content;align-content:start;align-items:start;justify-items:stretch;overflow:auto}.app[data-console-platform=mobile] .mixer{grid-row:2;min-height:0;display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:9px;align-items:center}.app[data-console-platform=mobile] .deck[data-side=B]{grid-row:3}.app[data-console-platform=mobile] .deck{min-height:530px}.app[data-console-platform=mobile] .mixer .dc-control[data-role=gain] .dc-surface{height:85px}.app[data-console-platform=mobile] .mixer #pauseBoth{grid-column:3}.app[data-console-platform=mobile] .djinfo{flex-wrap:wrap}.app[data-console-platform=mobile] .djinfo>.dc-control{max-width:none;flex-basis:100%}.app[data-console-platform=mobile] .djinfo #djTotal{display:none}.app[data-console-platform=mobile] .disc{width:156px}.app[data-console-platform=mobile] .deckhead{justify-content:center}.app[data-console-theme=acid] .eqrail .dc-surface{height:160px}}


@media(orientation:portrait){
 .app[data-console-platform=mobile] .console>.deck{width:100%;height:auto;grid-column:1}
 .app[data-console-platform=mobile] .mixer{width:100%;height:auto;min-height:200px;grid-column:1;grid-row:2;grid-template-columns:1fr 1.4fr 1fr;grid-template-rows:auto auto auto;align-content:start}
 .app[data-console-platform=mobile] .mixer>label{grid-column:1;grid-row:1}
 .app[data-console-platform=mobile] .mixer>.pair{grid-column:2;grid-row:1}
 .app[data-console-platform=mobile] .mixer #autoMix{grid-column:3;grid-row:1}
 .app[data-console-platform=mobile] .mixer #mixState{grid-column:1/-1;grid-row:2}
 .app[data-console-platform=mobile] .mixer #pauseBoth{grid-column:1/-1;grid-row:3}
}

/* Keep Play/CUE and both platters on screen in landscape; the active detail panel scrolls independently. */
@media(orientation:landscape) and (max-width:1100px){
 .app[data-console-platform=mobile] .console{align-items:stretch;grid-template-rows:minmax(300px,1fr)}
 .app[data-console-platform=mobile] .deck,.app[data-console-platform=mobile] .deck[data-side=B]{grid-template-columns:46px minmax(100px,1fr) minmax(126px,1.1fr);grid-template-rows:22px minmax(0,1fr) 40px;height:calc(100dvh - 96px);min-height:300px;padding:4px;gap:3px}
 .app[data-console-platform=mobile] .deck[data-side=B]{grid-template-columns:minmax(126px,1.1fr) minmax(100px,1fr) 46px}
 .app[data-console-platform=mobile] .deckhead{grid-column:2;grid-row:2;gap:4px;justify-content:center}
 .app[data-console-platform=mobile] .eqrail{grid-column:1;grid-row:2;gap:10px;flex-direction:column}.app[data-console-platform=mobile] .deck[data-side=B] .eqrail{grid-column:3;grid-row:2;flex-direction:column}
 .app[data-console-platform=mobile] .eqrail .dc-surface{width:44px;height:44px}.app[data-console-platform=mobile] .eqrail .dc-value{font-size:8px}
 .app[data-console-platform=mobile] .deckcontrol{grid-column:3;grid-row:2;gap:4px;overflow:hidden}.app[data-console-platform=mobile] .deck[data-side=B] .deckcontrol{grid-column:1;grid-row:2}
 .app[data-console-platform=mobile] .decktransport{grid-column:1/-1;grid-row:3}.app[data-console-platform=mobile] .decktransport button{min-height:38px}
 .app[data-console-platform=mobile] .deckTabs{gap:1px}.app[data-console-platform=mobile] .deckTabs button{font-size:9px;padding:1px;min-height:30px;min-width:0}
 .app[data-console-platform=mobile] .deckpanel{min-height:50px;flex:1;overflow:auto}.app[data-console-platform=mobile] .fxblock{align-content:start;padding:3px;gap:3px;display:grid;flex:1}
 .app[data-console-platform=mobile] .fxcell{align-self:start}.app[data-console-platform=mobile] .fxcell button{min-height:28px}.app[data-console-platform=mobile] .fxcell .dc-value{font-size:8px}
 .app[data-console-platform=mobile] .disc{width:112px;min-width:100px;max-width:calc(100% - 8px)}.app[data-console-platform=mobile] .decktitle{padding:4px 2px}.app[data-console-platform=mobile] .decktitle b{font-size:10px}.app[data-console-platform=mobile] .decktitle small{font-size:9px}
 .app[data-console-platform=mobile] .mixer{min-height:300px;height:calc(100dvh - 96px);gap:4px;padding:4px;overflow:auto}.app[data-console-platform=mobile] .mixer .dc-control[data-role=gain] .dc-surface{height:88px}.app[data-console-platform=mobile] .mixer .dc-control[data-role=master] .dc-surface{height:44px;width:44px}
 .app[data-console-platform=mobile] .mixer button{min-height:32px;font-size:10px}.app[data-console-platform=mobile] .mixState{font-size:9px}
 .app[data-console-theme=acid] .eqrail .dc-surface{height:84px;width:34px}.app[data-console-theme=acid] .eqrail .dc-cap{left:1px}.app[data-console-theme=acid] .deckhead{padding:2px}
 .app[data-console-theme=editorial] .eqrail .dc-control{grid-template-columns:1fr}.app[data-console-theme=editorial] .eqrail .dc-step{display:none}.app[data-console-theme=editorial] .eqrail .dc-surface{width:44px;height:44px}
 .app[data-console-theme=editorial] .fxcell .dc-control{grid-template-columns:20px minmax(20px,1fr) 20px}.app[data-console-theme=editorial] .fxblock{grid-template-columns:minmax(0,1fr)}.app[data-console-theme=editorial] .fxcell{display:grid;grid-template-columns:48px minmax(0,1fr);gap:3px;align-items:center}.app[data-console-theme=editorial] .fxcell>button{min-height:44px}.app[data-console-theme=editorial] .fxcell .dc-control{grid-template-columns:20px minmax(44px,1fr) 20px}
}
@media(orientation:landscape) and (max-width:740px){
 .app[data-console-platform=mobile] .console{grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr);gap:3px;padding:3px}
 .app[data-console-platform=mobile] .deck,.app[data-console-platform=mobile] .deck[data-side=B]{grid-template-columns:44px minmax(0,1fr);grid-template-rows:22px 155px minmax(100px,1fr) 40px;min-height:345px;height:auto}
 .app[data-console-platform=mobile] .deckhead{grid-column:2;grid-row:2}.app[data-console-platform=mobile] .deck[data-side=B] .eqrail{grid-column:1;grid-row:2}
 .app[data-console-platform=mobile] .deckcontrol,.app[data-console-platform=mobile] .deck[data-side=B] .deckcontrol{grid-column:1/-1;grid-row:3;display:grid;grid-template-columns:1fr;grid-template-rows:30px minmax(70px,1fr) 36px}
 .app[data-console-platform=mobile] .decktransport{grid-row:4}.app[data-console-platform=mobile] .decktitle small{display:none}
 .app[data-console-platform=mobile] .mixer{display:flex;grid-column:2;grid-row:1}.app[data-console-platform=mobile] .deck[data-side=B]{grid-column:3;grid-row:1}
 .app[data-console-platform=mobile] .fxblock{max-height:100px}.app[data-console-platform=mobile] .deckpanel{grid-row:2}.app[data-console-platform=mobile] .reverseblock{grid-row:3}
}

.dc-dialog{color:var(--dc-ink);background:var(--panel);border:1px solid var(--dc-line);border-radius:14px;width:min(780px,calc(100vw - 32px));max-height:88vh;overflow:auto;padding:24px;box-sizing:border-box;box-shadow:0 24px 80px #0009;font:14px/1.4 system-ui,sans-serif}.dc-dialog::backdrop{background:#050a12bb}.dc-dialog h2{margin:0 0 6px;font-size:24px}.dc-dialog p{margin:0 0 20px;color:var(--dc-muted);font-size:12px}.dc-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.dc-card{border:2px solid var(--dc-line);background:var(--dc-field);color:var(--dc-ink);border-radius:9px;padding:10px;cursor:pointer;text-align:left;font:inherit;min-width:0}.dc-card[aria-pressed=true]{border-color:var(--amber,var(--a));outline:1px solid var(--amber,var(--a))}.dc-card strong,.dc-card small{display:block;margin-top:10px}.dc-card strong{font-size:14px}.dc-card small{font-size:11px;line-height:1.5;color:var(--dc-muted)}.dc-preview{height:104px;border-radius:5px;background:linear-gradient(135deg,#23434e,#192237);display:flex;justify-content:space-evenly;align-items:center;border:1px solid #4a6379;position:relative}.dc-preview:after{content:attr(data-tag);position:absolute;bottom:7px;font:8px Consolas,monospace;letter-spacing:.2em;color:#c7e5e8}.dc-preview i{display:block;width:44px;height:44px;border:4px solid #405564;border-radius:50%;background:radial-gradient(circle,#405466 0 18%,#101b27 20% 100%);outline:2px solid #53dfc9}.dc-preview i:last-child{outline-color:#b89aff}.dc-preview b{display:block;width:9px;height:45px;background:linear-gradient(#25394a 45%,#6bd8c7 45% 57%,#25394a 57%);border:1px solid #6a8599}.dc-card[data-theme=acid] .dc-preview{background:#12190c;border-color:#596c34}.dc-card[data-theme=acid] .dc-preview i{border-radius:3px;width:30px;background:linear-gradient(#151f10 45%,#d3f34a 45% 55%,#151f10 55%);outline:0;border:1px solid #6a7851}.dc-card[data-theme=acid] .dc-preview b{background:#c9ee4d;width:3px}.dc-card[data-theme=editorial] .dc-preview{background:#e1e4d7;border-color:#9ea58e}.dc-card[data-theme=editorial] .dc-preview i{border:4px solid #b2b8a8;background:radial-gradient(circle,#daddd0 50%,#a1a995 51%);outline:1px solid #a1a995}.dc-card[data-theme=editorial] .dc-preview b{background:#bf4825;border-color:#bc4825}.dc-card[data-theme=editorial] .dc-preview:after{color:#394130}.dc-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}.dc-actions button{min-height:40px;border:1px solid var(--dc-line);border-radius:7px;background:var(--dc-field);color:var(--dc-ink);padding:8px 14px;cursor:pointer}.dc-actions button:last-child{background:var(--amber,var(--a));color:var(--bg)}
@media(max-width:600px){.dc-dialog{padding:16px}.dc-options{grid-template-columns:1fr}.dc-card{display:grid;grid-template-columns:100px 1fr;column-gap:12px}.dc-preview{grid-row:1/3;height:94px}.dc-preview i{width:25px;height:25px}.dc-card small{margin-top:4px}.dc-card strong{align-self:end;margin-top:0}.dc-dialog h2{font-size:20px}}
@media(prefers-reduced-motion:reduce){.dc-surface,.dc-control,.dc-cap{transition:none!important}}
`;
  const mounted = new WeakMap();
  window.DekaConsoleDesigns = { themes, css, mount(root, { platform, trigger, key }) {
    if (mounted.has(root)) return mounted.get(root);
    const style = document.createElement('style'); style.dataset.dekaConsoleStyles = '021'; style.textContent = css;
    if (platform === 'mobile') root.getRootNode().appendChild(style); else document.head.appendChild(style);
    root.dataset.consolePlatform = platform;
    DekaConsoleControls.mount(root, platform);
    let saved = 'aurora', pending;
    try { const s = localStorage.getItem(key); if (themes.some(t => t.id === s)) saved = s; } catch (_) {}
    const dialog = document.createElement('dialog'); dialog.className = 'dc-dialog'; dialog.id = 'djThemeDialog'; dialog.setAttribute('aria-labelledby', 'djThemeTitle');
    dialog.innerHTML = '<h2 id="djThemeTitle">Выберите пульт</h2><p>Три варианта управления. Треки, позиции и настройки звука сохраняются.</p><div class="dc-options"></div><div class="dc-actions"><button type="button" id="djThemeCancel">Отмена</button><button type="button" id="djThemeSave">Сохранить пульт</button></div>';
    root.appendChild(dialog);
    function apply(id) {
      DekaConsoleControls.cancel(root); pending = id; root.dataset.consoleTheme = id;
      if (platform === 'desktop') themes.forEach(t => document.documentElement.classList.toggle('deka-theme-' + t.id, t.id === id));
      DekaConsoleControls.theme(root, id);
      dialog.querySelectorAll('[data-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === id)));
      // Virtual rows and the background mirror use the same mounted elements.
      if(platform==='desktop')window.dispatchEvent(new Event('resize'));
      else root.dispatchEvent(new Event('deka:console-layout'));
    }
    for (const t of themes) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dc-card'; b.dataset.theme = t.id;
      b.innerHTML = '<span class="dc-preview" data-tag="' + t.tag + '" aria-hidden="true"><i></i><b></b><i></i></span><strong></strong><small></small>';
      b.querySelector('strong').textContent = t.name; b.querySelector('small').textContent = t.text;
      b.onclick = () => apply(t.id); dialog.querySelector('.dc-options').appendChild(b);
    }
    trigger.textContent = 'Пульт'; trigger.setAttribute('aria-haspopup', 'dialog'); trigger.onclick = () => { apply(saved); dialog.showModal(); };
    dialog.querySelector('#djThemeSave').onclick = () => { saved = pending; try { localStorage.setItem(key, saved); } catch (_) {} dialog.close(); };
    dialog.querySelector('#djThemeCancel').onclick = () => { apply(saved); dialog.close(); };
    dialog.addEventListener('cancel', () => apply(saved));
    dialog.addEventListener('close', () => { if (dialog.open) return; apply(saved); trigger.focus({ preventScroll: true }); });
    apply(saved);
    const api = { get theme() { return pending; }, sync() { DekaConsoleControls.sync(root); } }; mounted.set(root, api); return api;
  } };
})();
