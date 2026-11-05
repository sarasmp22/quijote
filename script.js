/* =========================================================
   Don Quijote · libro de tapa dura en 3D que gira con el scroll
   Hecho con Three.js: sin marca de agua y con control total.
   Si el 3D no carga, se queda la imagen de respaldo.
   ========================================================= */

(function () {
  const escena = document.querySelector('.escena');
  const contenedor = document.querySelector('.escena__lienzo');
  const lienzo = document.getElementById('lienzo-libro');
  if (!escena || !contenedor || !lienzo || typeof THREE === 'undefined') return;

  // ---------- 0. Ajustes (cámbialos aquí) ----------
  const AJUSTES = Object.assign({
    vueloMm: 3,          // lo que sobresalen las tapas de las hojas, en mm
    sombraContacto: 0.55, // sombra pegada a la base del libro (0 a 1)
    sombraSuave: 0.35     // sombra amplia y difusa alrededor (0 a 1)
  }, window.AJUSTES_LIBRO || {});
  const MM = 1.98 / 210; // el libro mide 21 cm de alto: 1 mm en unidades 3D

  const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const grados = (g) => (g * Math.PI) / 180;

  // ---------- 1. Render nítido ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
  } catch (e) {
    return; // sin WebGL: se queda la imagen de respaldo
  }
  // Siempre al menos 2x: así se ve nítido también en pantallas normales
  renderer.setPixelRatio(Math.min(3, Math.max(2, window.devicePixelRatio || 1)));
  renderer.outputEncoding = THREE.sRGBEncoding; // colores fieles al diseño

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // Luz suave: una general y una principal desde arriba a la izquierda
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e2d8, 0.55));
  const luz = new THREE.DirectionalLight(0xffffff, 0.5);
  luz.position.set(-2.5, 3, 5);
  scene.add(luz);
  // Luz de relleno desde la derecha: da vida al canto de las hojas
  const relleno = new THREE.DirectionalLight(0xfff8ee, 0.22);
  relleno.position.set(5, 1, 1);
  scene.add(relleno);

  // ---------- 2. Texturas ----------
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const cargador = new THREE.TextureLoader();
  function textura(ruta) {
    const t = cargador.load(ruta);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = maxAniso;
    return t;
  }

  // Grano de papel: ruido muy suave para que la tapa no parezca plástico
  function grano() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const img = g.createImageData(512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 60;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  }
  const texGrano = grano();

  // Cantos de las hojas: muchas líneas finas con algo de contraste
  // y un poco más oscuras junto a las tapas, como en un libro real.
  // apiladas = 'u' si las hojas se apilan a lo ancho de la textura, 'v' si a lo alto
  function texturaHojas(apiladas) {
    const N = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = '#F3ECDC';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < N; i += 2) {
      const a = 0.10 + Math.random() * 0.22;
      g.fillStyle = 'rgba(120, 100, 78,' + a.toFixed(3) + ')';
      if (apiladas === 'u') g.fillRect(i, 0, 1, N); else g.fillRect(0, i, N, 1);
    }
    // Oscurecer los extremos (donde las hojas tocan las tapas)
    const grad = apiladas === 'u' ? g.createLinearGradient(0, 0, N, 0) : g.createLinearGradient(0, 0, 0, N);
    grad.addColorStop(0, 'rgba(90, 72, 55, 0.28)');
    grad.addColorStop(0.12, 'rgba(90, 72, 55, 0)');
    grad.addColorStop(0.88, 'rgba(90, 72, 55, 0)');
    grad.addColorStop(1, 'rgba(90, 72, 55, 0.28)');
    g.fillStyle = grad;
    g.fillRect(0, 0, N, N);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = maxAniso;
    return t;
  }

  const papel = (opciones) => new THREE.MeshStandardMaterial(Object.assign({
    roughness: 0.88, metalness: 0, bumpMap: texGrano, bumpScale: 0.0015
  }, opciones));
  const CREMA = 0xF4ECDA;      // canto del cartón (color del papel de la cubierta)
  const GUARDA = 0xEFE6D2;     // interior de la tapa

  // ---------- 3. El libro de tapa dura ----------
  // Medidas en proporción a la cubierta real (1453 x 2048 px)
  const ANCHO = 1.4, ALTO = 1.98, GROSOR = 0.45;
  const CARTON = 0.022;  // grosor de la tapa
  let VUELO = AJUSTES.vueloMm * MM; // lo que sobresale la tapa de las hojas
  const RADIO = 0.016;   // curvatura mínima de las esquinas
  const BISEL = 0.004;   // canto ligeramente redondeado

  const libro = new THREE.Group();
  scene.add(libro);

  const canto = papel({ color: CREMA });
  const guarda = papel({ color: GUARDA });

  // Rectángulo con esquinas redondeadas (r por esquina: [abajo-izq, abajo-der, arriba-der, arriba-izq])
  function rectRedondo(w, h, r) {
    const s = new THREE.Shape();
    const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
    s.moveTo(x0 + r[0], y0);
    s.lineTo(x1 - r[1], y0);
    if (r[1]) s.quadraticCurveTo(x1, y0, x1, y0 + r[1]);
    s.lineTo(x1, y1 - r[2]);
    if (r[2]) s.quadraticCurveTo(x1, y1, x1 - r[2], y1);
    s.lineTo(x0 + r[3], y1);
    if (r[3]) s.quadraticCurveTo(x0, y1, x0, y1 - r[3]);
    s.lineTo(x0, y0 + r[0]);
    if (r[0]) s.quadraticCurveTo(x0, y0, x0 + r[0], y0);
    return s;
  }

  // Coloca la imagen en la cara (u, v de 0 a 1 según el tamaño)
  // uFn (opcional) decide la u a partir de la x local, para encajar la imagen con el lomo
  function ajustarUV(geo, w, h, uFn) {
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      uv.setXY(i, uFn ? uFn(x) : (x + w / 2) / w, (pos.getY(i) + h / 2) / h);
    }
    uv.needsUpdate = true;
  }

  // Un cartón con cantos suaves y la imagen impresa encima
  // w, h: medidas finales; r: radios; imagen: ruta o null
  function carton(w, h, r, imagen, uFn) {
    const g = new THREE.Group();
    const wi = w - BISEL * 2, hi = h - BISEL * 2; // el bisel suma por fuera
    const cuerpo = new THREE.ExtrudeGeometry(rectRedondo(wi, hi, r), {
      depth: CARTON - BISEL * 2, bevelEnabled: true, bevelThickness: BISEL,
      bevelSize: BISEL, bevelSegments: 3, curveSegments: 8
    });
    cuerpo.translate(0, 0, -(CARTON - BISEL * 2) / 2);
    g.add(new THREE.Mesh(cuerpo, canto));
    if (imagen) {
      const cara = new THREE.ShapeGeometry(rectRedondo(wi, hi, r), 8);
      ajustarUV(cara, wi, hi, uFn);
      const mat = papel({ map: textura(imagen), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const m = new THREE.Mesh(cara, mat);
      m.position.z = CARTON / 2 + 0.0002;
      g.add(m);
    }
    return g;
  }

  // ---- Tapas y lomo como en un libro real ----
  // El lomo es una sola pieza en forma de U que dobla por las dos esquinas
  // y se monta un poco sobre las tapas. Así no hay junta ni arista suelta:
  // la imagen pasa del lomo a la cubierta sin cortes, como el papel impreso.
  const R_LOMO = 0.03;        // curva de las esquinas del lomo
  const BISAGRA = 0.07;       // cuánto se monta el lomo sobre cada tapa
  const SOBRE = 0.0008;       // lo que sobresale la pieza del lomo (invisible)
  const X0 = -ANCHO / 2 + CARTON / 2;     // donde empieza la imagen de cubierta
  const SPAN = ANCHO / 2 - X0;            // ancho de la imagen de cubierta
  // Proporciones de la tapa completa (contracubierta | lomo | cubierta) en píxeles
  const PX_C = 1453, PX_L = 477, PX_T = PX_C * 2 + PX_L;
  const uCubierta = (x) => (PX_C + PX_L) / PX_T + ((x - X0) / SPAN) * PX_C / PX_T;
  const uContra = (x) => (1 - (x - X0) / SPAN) * PX_C / PX_T;
  const uLomo = (z) => PX_C / PX_T + ((z + GROSOR / 2) / GROSOR) * PX_L / PX_T;

  // Tapas: empiezan donde el lomo ya es plano
  const anchoTapa = ANCHO / 2 - (-ANCHO / 2 + R_LOMO);
  const xTapa = -ANCHO / 2 + R_LOMO + anchoTapa / 2;
  const rTapa = [0, RADIO, RADIO, 0]; // solo se redondean las esquinas del corte

  const tapa = carton(anchoTapa, ALTO, rTapa, 'img/cubierta.webp',
    (lx) => ((xTapa + lx) - X0) / SPAN);
  tapa.position.set(xTapa, 0, GROSOR / 2 - CARTON / 2);
  libro.add(tapa);

  // La contracubierta se gira 180º para que la imagen mire hacia atrás
  const contra = carton(anchoTapa, ALTO, [RADIO, 0, 0, RADIO], 'img/contracubierta.webp',
    (lx) => 1 - ((xTapa - lx) - X0) / SPAN); // girada: las esquinas redondas quedan en el corte
  contra.rotation.y = Math.PI;
  contra.position.set(xTapa, 0, -(GROSOR / 2 - CARTON / 2));
  libro.add(contra);

  // Perfil del lomo visto desde arriba: de la bisagra trasera a la delantera
  function perfilLomo() {
    const pts = [];
    const zf = GROSOR / 2 + SOBRE, zb = -zf, xs = -ANCHO / 2 + R_LOMO + BISAGRA;
    const xl = -ANCHO / 2, cx = xl + R_LOMO, PASOS = 12;
    const push = (x, z, nx, nz, u) => pts.push({ x, z, nx, nz, u });
    // trasera, plana
    for (let i = 0; i <= 4; i++) { const x = xs - (xs - cx) * i / 4; push(x, zb, 0, -1, uContra(x)); }
    // esquina trasera
    const u0 = uContra(cx), u1 = uLomo(zb + R_LOMO);
    for (let i = 1; i < PASOS; i++) {
      const a = -Math.PI / 2 - (Math.PI / 2) * i / PASOS;
      push(cx + Math.cos(a) * R_LOMO, zb + R_LOMO + Math.sin(a) * R_LOMO, Math.cos(a), Math.sin(a), u0 + (u1 - u0) * i / PASOS);
    }
    // lomo, plano
    for (let i = 0; i <= 8; i++) { const z = (zb + R_LOMO) + (zf - zb - 2 * R_LOMO) * i / 8; push(xl, z, -1, 0, uLomo(z)); }
    // esquina delantera
    const u2 = uLomo(zf - R_LOMO), u3 = uCubierta(cx);
    for (let i = 1; i < PASOS; i++) {
      const a = Math.PI - (Math.PI / 2) * i / PASOS;
      push(cx + Math.cos(a) * R_LOMO, zf - R_LOMO + Math.sin(a) * R_LOMO, Math.cos(a), Math.sin(a), u2 + (u3 - u2) * i / PASOS);
    }
    // delantera, plana
    for (let i = 0; i <= 4; i++) { const x = cx + (xs - cx) * i / 4; push(x, zf, 0, 1, uCubierta(x)); }
    return pts;
  }

  function piezaLomo() {
    const g = new THREE.Group();
    const p = perfilLomo(), n = p.length, y0 = -ALTO / 2, y1 = ALTO / 2;
    // Cara exterior (con la imagen) e interior: dos vértices por punto del perfil
    function superficie(desplaza, invertir, conUV) {
      const pos = [], nor = [], uv = [], idx = [];
      p.forEach((q) => {
        const x = q.x - q.nx * desplaza, z = q.z - q.nz * desplaza;
        const s = invertir ? -1 : 1;
        pos.push(x, y0, z, x, y1, z);
        nor.push(q.nx * s, 0, q.nz * s, q.nx * s, 0, q.nz * s);
        uv.push(conUV ? q.u : 0, 0, conUV ? q.u : 0, 1);
      });
      for (let i = 0; i < n - 1; i++) {
        const A = i * 2, C = i * 2 + 1, B = A + 2, D = A + 3;
        if (invertir) idx.push(A, C, B, B, C, D); else idx.push(A, B, C, B, D, C);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      return geo;
    }
    g.add(new THREE.Mesh(superficie(0, false, true), papel({ map: textura('img/tapa-completa.webp') })));
    g.add(new THREE.Mesh(superficie(CARTON, true, false), guarda));
    // Tapas de arriba y abajo: el canto del cartón
    for (const [y, ny] of [[y1, 1], [y0, -1]]) {
      const pos = [], nor = [], uv = [], idx = [];
      p.forEach((q) => {
        pos.push(q.x, y, q.z, q.x - q.nx * CARTON, y, q.z - q.nz * CARTON);
        nor.push(0, ny, 0, 0, ny, 0);
        uv.push(0, 0, 0, 0);
      });
      for (let i = 0; i < n - 1; i++) {
        const O = i * 2, I = i * 2 + 1, O1 = O + 2, I1 = O + 3;
        if (ny > 0) idx.push(O, O1, I, I, O1, I1); else idx.push(O, I, O1, I, I1, O1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      g.add(new THREE.Mesh(geo, canto));
    }
    return g;
  }
  libro.add(piezaLomo());

  // Bloque de hojas, apenas más pequeño que las tapas
  const hojasGrosor = GROSOR - CARTON * 2 - 0.002;
  const texCorte = texturaHojas('u'); // canto delantero: hojas apiladas a lo ancho (eje z)
  const texCabeza = texturaHojas('v'); // arriba y abajo: hojas apiladas a lo alto de la textura (eje z)
  const hojaCorte = new THREE.MeshStandardMaterial({ map: texCorte, bumpMap: texCorte, bumpScale: 0.002, roughness: 0.95 });
  const hojaCabeza = new THREE.MeshStandardMaterial({ map: texCabeza, bumpMap: texCabeza, bumpScale: 0.002, roughness: 0.95 });
  let hojas = null;
  function construirHojas() {
    if (hojas) { libro.remove(hojas); hojas.geometry.dispose(); }
    const hojasAncho = ANCHO - CARTON - 0.001 - VUELO;
    const hojasAlto = ALTO - VUELO * 2;
    // Orden de las caras de una caja: +x, -x, +y, -y, +z, -z
    hojas = new THREE.Mesh(
      new THREE.BoxGeometry(hojasAncho, hojasAlto, hojasGrosor),
      [hojaCorte, guarda, hojaCabeza, hojaCabeza, guarda, guarda]
    );
    hojas.position.x = -ANCHO / 2 + CARTON + 0.001 + hojasAncho / 2;
    libro.add(hojas);
  }
  construirHojas();

  // ---------- 4. Sombras ----------
  const COLOR_SOMBRA = '58, 46, 36';

  // a) Sombra de contacto: la huella del libro, muy pegada a la base.
  //    Gira con el libro, así siempre coincide con su forma.
  const MARGEN = 0.35;
  const cW = 1024, cH = Math.round(1024 * (GROSOR + MARGEN * 2) / (ANCHO + MARGEN * 2));
  const cc = document.createElement('canvas');
  cc.width = cW; cc.height = cH;
  const gc = cc.getContext('2d');
  const escalaC = cW / (ANCHO + MARGEN * 2);
  function huella(desenfoque, alfa, crece) {
    // Dibujamos el rectángulo fuera del lienzo y solo dejamos su sombra
    const w = (ANCHO + crece) * escalaC, h = (GROSOR + crece) * escalaC;
    const x = (cW - w) / 2, y = (cH - h) / 2;
    gc.save();
    gc.shadowColor = 'rgba(' + COLOR_SOMBRA + ',' + alfa + ')';
    gc.shadowBlur = desenfoque;
    gc.shadowOffsetX = cW * 2;
    gc.fillStyle = '#000';
    gc.fillRect(x - cW * 2, y, w, h);
    gc.restore();
  }
  huella(70, 0.35, 0.12);  // halo cercano
  huella(22, 0.55, 0.0);   // contacto
  huella(6, 0.6, -0.04);   // línea de apoyo, la más oscura
  const texContacto = new THREE.CanvasTexture(cc);
  const contacto = new THREE.Mesh(
    new THREE.PlaneGeometry(ANCHO + MARGEN * 2, GROSOR + MARGEN * 2),
    new THREE.MeshBasicMaterial({ map: texContacto, transparent: true, depthWrite: false, opacity: AJUSTES.sombraContacto })
  );
  contacto.rotation.x = -Math.PI / 2;
  contacto.position.y = -ALTO / 2 - 0.004;
  scene.add(contacto);

  // b) Sombra suave: degradado amplio, algo desplazado hacia atrás a la derecha
  //    porque la luz viene de delante a la izquierda.
  const cs = document.createElement('canvas');
  cs.width = cs.height = 512;
  const gs = cs.getContext('2d');
  const grad = gs.createRadialGradient(256, 256, 0, 256, 256, 256);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const a = Math.exp(-4.5 * t * t) * (1 - t);
    grad.addColorStop(t, 'rgba(' + COLOR_SOMBRA + ',' + (a * 0.5).toFixed(4) + ')');
  }
  gs.fillStyle = grad;
  gs.fillRect(0, 0, 512, 512);
  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cs), transparent: true, depthWrite: false, opacity: AJUSTES.sombraSuave })
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.set(0.25, -ALTO / 2 - 0.006, -0.2);
  scene.add(sombra);

  // Para el banco de pruebas: cambia ajustes en vivo
  window.libro3d = {
    ajustes: AJUSTES,
    aplicar(nuevos) {
      Object.assign(AJUSTES, nuevos);
      contacto.material.opacity = AJUSTES.sombraContacto;
      sombra.material.opacity = AJUSTES.sombraSuave;
      const v = AJUSTES.vueloMm * MM;
      if (v !== VUELO) { VUELO = v; construirHojas(); }
    }
  };

  // ---------- 5. Las tres posturas (en grados) ----------
  const posturas = [
    { giro: -28, inclina: 0 },  // 01 · la cubierta
    { giro: 80,  inclina: 0 },  // 02 · el lomo
    { giro: 200, inclina: 0 }   // 03 · la contracubierta
  ];
  const suave = (t) => t * t * (3 - 2 * t);
  const mezcla = (a, b, t) => a + (b - a) * t;

  function progreso() {
    const r = escena.getBoundingClientRect();
    const recorrido = r.height - window.innerHeight;
    if (recorrido <= 0) return 0;
    return Math.min(1, Math.max(0, -r.top / recorrido));
  }
  function posturaEn(p) {
    const tramos = posturas.length - 1;
    const x = p * tramos;
    const i = Math.min(tramos - 1, Math.floor(x));
    const t = suave(Math.min(1, Math.max(0, (x - i - 0.15) / 0.7))); // pausa en cada postura
    const a = posturas[i], b = posturas[i + 1];
    return { giro: mezcla(a.giro, b.giro, t), inclina: mezcla(a.inclina, b.inclina, t) };
  }

  // ---------- 6. Ratón: un balanceo mínimo ----------
  // Arrastrar el libro: se puede girar con el dedo o el ratón y al soltar
  // vuelve solo a su sitio. Solo cuenta un gesto claramente horizontal: al
  // deslizar en vertical para hacer scroll, el libro no se mueve (antes el
  // dedo lo torcía un poco y luego volvía de golpe, y eso era el trompicón).
  let arrastre = 0, arrastrando = false, xPrevio = 0, xIni = 0, yIni = 0, decidido = false;
  lienzo.style.touchAction = 'pan-y';
  lienzo.addEventListener('pointerdown', (e) => {
    arrastrando = true; decidido = e.pointerType === 'mouse';
    xPrevio = xIni = e.clientX; yIni = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (!arrastrando) return;
    if (!decidido) {
      const dx = Math.abs(e.clientX - xIni), dy = Math.abs(e.clientY - yIni);
      if (dx < 8 && dy < 8) return;
      if (dy >= dx) { arrastrando = false; return; } // es scroll, no arrastre
      decidido = true; xPrevio = e.clientX;
    }
    arrastre += (e.clientX - xPrevio) * 0.6;
    arrastre = Math.max(-120, Math.min(120, arrastre));
    xPrevio = e.clientX;
  }, { passive: true });
  const soltar = () => { arrastrando = false; };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
  const raton = { x: 0, y: 0 };
  if (!menosMovimiento) {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return; // con el dedo no hay balanceo
      raton.x = (e.clientX / window.innerWidth - 0.5) * 8;
      raton.y = (e.clientY / window.innerHeight - 0.5) * 4;
    }, { passive: true });
  }

  // ---------- 7. Tamaño ----------
  let distancia = 6;
  function ajustar() {
    const w = contenedor.clientWidth, h = contenedor.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Más lejos en pantallas estrechas para que quepa el libro
    // En el diseño de móvil (hasta 800 px) siempre la distancia de móvil, aunque
    // la ventana sea ancha: si no, el libro sale cortado por arriba
    distancia = (w / h < 0.8 || window.matchMedia('(max-width: 800px)').matches) ? 7.5 : 5.4;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(ajustar).observe(contenedor);
  ajustar();

  // ---------- 8. Bucle ----------
  // El giro va ligado a las tarjetas de texto: mientras una tarjeta está en
  // pantalla el libro se queda quieto en su postura, y solo gira en el hueco
  // entre que una tarjeta se va por arriba y la siguiente entra por abajo.
  // Así el texto nunca tapa el libro mientras gira.
  const tarjetas = Array.from(document.querySelectorAll('.paso__tarjeta'));
  let ultimoScroll = 0;
  window.addEventListener('scroll', () => { ultimoScroll = performance.now(); }, { passive: true });
  const quieto = () => performance.now() - ultimoScroll > 220;
  function posturaPorTarjetas() {
    const vh = window.innerHeight;
    for (let i = 0; i < tarjetas.length - 1; i++) {
      const ra = tarjetas[i].getBoundingClientRect();
      const rb = tarjetas[i + 1].getBoundingClientRect();
      // Gira mientras el texto i sube hacia arriba y el siguiente llega a la
      // mitad de la pantalla: así el libro ya está de frente cuando su texto
      // está centrado, no cuando aún asoma por abajo
      const ca = (ra.top + ra.bottom) / 2, cb = (rb.top + rb.bottom) / 2;
      const desde = ca - vh * 0.38;   // > 0: el texto i aún está a la vista
      const hasta = cb - vh * 0.5;    // > 0: el siguiente aún no ha llegado al centro
      if (desde > 0) return posturas[i];
      if (hasta > 0) {
        const total = hasta - desde; // desde <= 0 < hasta
        let t = Math.min(1, Math.max(0, -desde / total));
        t = suave(t);
        const a = posturas[i], b = posturas[i + 1];
        return { giro: mezcla(a.giro, b.giro, t), inclina: mezcla(a.inclina, b.inclina, t) };
      }
    }
    // Ya se ve la última tarjeta (o no hay tarjetas)
    return posturas[Math.min(posturas.length, Math.max(1, tarjetas.length)) - 1];
  }

  // ---- Móvil: línea de tiempo con el scroll de la escena ----
  // cara 1 · giro · cara 2 · giro · cara 3. La tarjeta de cada cara solo
  // aparece cuando el libro ya la muestra entera.
  const movil = window.matchMedia('(max-width: 800px)');
  const pasos = Array.from(document.querySelectorAll('.paso'));
  // En móvil cada cara se ve de frente: 0°, 90° y 180°
  const POSTURAS_MOVIL = [{ giro: 0, inclina: 0 }, { giro: 90, inclina: 0 }, { giro: 180, inclina: 0 }];
  // Móvil: el libro se queda de frente mientras su texto sube y se lee
  // (el texto que se mueve ya indica que hay que seguir bajando). Solo gira
  // cuando el texto anterior ya se ha ido y antes de que asome el siguiente.
  // Móvil: todos los bloques de texto miden lo mismo (min-height en CSS), así
  // cada giro ocupa el mismo recorrido de scroll y todos van al mismo ritmo.
  // Posiciones en fracción de pantalla (0 arriba, 1 abajo), medidas por el
  // borde superior del texto:
  const LLEGA = 0.70;   // el giro termina cuando el texto siguiente llega aquí
  const LECTURA = 0.66; // ...y se queda fijo aquí mientras se lee (sticky en CSS)
  const PAUSA = 0.38;   // recorrido de lectura (igual que padding-bottom del paso)
  const SE_VA = 0.62;   // al soltarse, empieza a desvanecerse aquí
  const IDO = 0.54;     // ...ya no se ve, y el libro empieza a girar
  const DERIVA = 6;     // grados que el libro gira despacio mientras se lee
  const puntos = Array.from(document.querySelectorAll('.progreso-libro li'));
  const indicador = document.querySelector('.progreso-libro');
  const marcarPunto = (i) => puntos.forEach((li, n) => li.classList.toggle('actual', n === i));
  function posturaMovil() {
    // Altura estable de pantalla (100svh): en el móvil, la barra del navegador
    // aparece y desaparece al hacer scroll y cambia innerHeight; si usáramos
    // ese valor, el giro daría un pequeño salto cada vez
    const vh = contenedor.clientHeight || window.innerHeight, r = escena.getBoundingClientRect();
    if (indicador) indicador.classList.toggle('visible', r.top <= 1 && r.bottom >= vh - 1);
    // Cuando la escena termina, el libro y el texto suben juntos: se compensa
    const desplaza = Math.max(0, vh - r.bottom);
    const q = tarjetas.map((t) => (t.getBoundingClientRect().top + desplaza) / vh);
    const caja = pasos.map((p) => (p.getBoundingClientRect().top + desplaza) / vh);
    const cara = (i) => POSTURAS_MOVIL[i].giro;
    const lectura = (i) => Math.min(1, Math.max(0, (LECTURA - caja[i]) / PAUSA));
    const n = q.length;
    let giro = cara(n - 1) + DERIVA * lectura(n - 1), cercana = n - 1;
    for (let i = 0; i < n - 1; i++) {
      const desde = q[i] - IDO;        // > 0: el texto i aún se ve
      const hasta = q[i + 1] - LLEGA;  // > 0: el siguiente aún no ha llegado
      if (desde > 0) { giro = cara(i) + DERIVA * lectura(i); cercana = i; break; }
      if (hasta > 0) {
        const t = Math.min(1, Math.max(0, -desde / (hasta - desde)));
        // empieza el giro justo donde se quedó el balanceo de lectura: sin saltos
        const t2 = t * t * t * (t * (t * 6 - 15) + 10); // arranque y frenada más suaves
        giro = mezcla(cara(i) + DERIVA * lectura(i), cara(i + 1), t2);
        cercana = t < 0.5 ? i : i + 1;
        break;
      }
    }
    pasos.forEach((p, i) => {
      p.style.setProperty('--visible', Math.min(1, Math.max(0, (q[i] - IDO) / (SE_VA - IDO))).toFixed(3));
    });
    marcarPunto(cercana);
    return { giro, inclina: 0 };
  }
  const posturaActual = () => movil.matches ? posturaMovil() : posturaPorTarjetas();

  const actual = Object.assign({}, posturaActual());
  const rx = { x: 0, y: 0 };
  function bucle() {
    const objetivo = posturaActual();
    // Inercia: el libro "persigue" al scroll y frena poco a poco. Se ajusta al
    // tiempo real entre fotogramas para que vaya igual de fluido en cualquier móvil.
    const ahora = performance.now();
    const dt = Math.min(64, ahora - (bucle.ultimo || ahora)); bucle.ultimo = ahora;
    const base = movil.matches ? 0.045 : 0.06; // en móvil, frenada más lenta
    const k = menosMovimiento ? 1 : 1 - Math.pow(1 - base, dt / 16.67);
    actual.giro = mezcla(actual.giro, objetivo.giro, k);
    actual.inclina = mezcla(actual.inclina, objetivo.inclina, k);
    rx.x = mezcla(rx.x, raton.x, 0.06);
    rx.y = mezcla(rx.y, raton.y, 0.06);

    if (!arrastrando) arrastre = mezcla(arrastre, 0, 0.08); // vuelve a su sitio al soltar
    libro.rotation.y = grados(actual.giro + rx.x + arrastre);
    // Solo gira sobre su eje vertical: el libro siempre apoya plano en la superficie
    libro.rotation.x = 0;
    contacto.rotation.z = libro.rotation.y; // la huella gira con el libro
    sombra.rotation.z = libro.rotation.y * 0.3;

    // En móvil subimos un poco el libro para dejar sitio a la tarjeta de abajo
    const dy = movil.matches ? -0.62 : 0;
    camera.position.set(0, 0.35 + dy, distancia);
    camera.lookAt(0, -0.05 + dy, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(bucle);
  }

  escena.classList.add('con-3d');
  // El 3D ya funciona: el lector de pantalla anuncia el lienzo (con su descripción)
  // y deja de anunciar la imagen de respaldo, que ahora está oculta
  lienzo.removeAttribute('aria-hidden');
  bucle();
})();

/* ---------- Aviso "Desliza para ver el libro" ----------
   Fuera del bloque del 3D: funciona aunque el libro no cargue. */
(function () {
  const pista = document.querySelector('.pista-scroll');
  if (!pista) return;
  const revisar = () => pista.classList.toggle('oculta', window.scrollY > 40);
  window.addEventListener('scroll', revisar, { passive: true });
  revisar();
})();

/* ---------- Idioma: español / inglés ----------
   Los textos en español están en el HTML; aquí van los ingleses.
   El idioma se elige con los botones ES / EN y se guarda en la dirección (#en). */
(function () {
  const EN = {
 "t1": "El ingenioso hidalgo",
 "t2": "de la Mancha",
 "t3": "Scroll to see the book",
 "t4": "Part 1 of 3",
 "t5": "Part 2 of 3",
 "t6": "Part 3 of 3",
 "t7": "The front cover",
 "t8": "The spine",
 "t9": "The back cover",
 "t10": "The title in three levels, with the red Q linking to the pendant. <span class=\"texto-extra\">Hardcover in solid board, wrapped in 170 g matte coated paper with a scratch-resistant matte lamination.</span>",
 "t11": "The same hierarchy set vertically, so it can be recognised on the shelf. <span class=\"texto-extra\">Sewn binding, so the book opens without forcing it, with a headband on the spine.</span>",
 "t12": "A symbol of its own for the one thing Don Quixote never gives up: love. <span class=\"texto-extra\">Printed in CMYK. Interior on 80 g cream offset paper, with endpapers printed in red that carry the visual system through.</span>",
 "t13": "Case study <span>Product presentation on the web</span>",
 "t14": "Editorial design of El ingenioso hidalgo don Quijote de la Mancha and development of its web presentation: an interactive 3D model that shows the front cover, spine and back cover in sync with the scroll.",
 "t15": "<span class=\"caso__grupo\">Book</span> · The concept",
 "t16": "<span class=\"caso__grupo\">Book</span> · The interior",
 "t17": "<span class=\"caso__grupo\">Book</span> · Production",
 "t18": "<span class=\"caso__grupo\">Web</span> · The problem",
 "t19": "<span class=\"caso__grupo\">Web</span> · The solution",
 "t20": "<span class=\"caso__grupo\">Web</span> · User testing",
 "t21": "<span class=\"caso__grupo\">Web</span> · Development",
 "t22": "<span class=\"caso__grupo\">Web</span> · Accessibility",
 "t23": "A graphic element of its own at the heart of the visual system",
 "t24": "An interior system designed for reading",
 "t25": "A book prepared for print",
 "t26": "Selling books online loses the information of the physical object",
 "t27": "Interactive 3D visualisation in sync with the scroll",
 "t28": "Testing with users who had no prior context",
 "t29": "Technical decisions behind the website",
 "t30": "Criteria from the WCAG 2.2 guidelines, level AA",
 "t31": "Editions of Don Quixote usually rely on the imagery of the lance, the windmills or Rocinante. This design starts from a different reading of the work: love as the one thing Don Quixote never gives up.",
 "t32": "To represent it, a heart-shaped pendant is drawn in ink next to the nobleman and acts as the thread running through the system. It appears in the character's hand on the front cover, links to the red Q of the title, reappears at a smaller scale on the back cover and is repeated as a pattern over the project red on the endpapers.",
 "t33": "The title is set in three levels in ZT Neue Ralewe, paired with Cormorant Garamond. The spine repeats the same hierarchy vertically and closes with the Tappiz imprint, as in a collection.",
 "t34": "The layout is built on a ternary proportion with progressive margins: 15 mm inner, 21 mm head, 30 mm outer and 42 mm foot. The text is set in Cormorant Garamond, justified and hyphenated to keep an even typographic colour.",
 "t35": "Each chapter opens with a large red drop cap and the first sentence in bold red. Running heads carry the author and title in red small caps, and page numbers are set in italics.",
 "t36": "To support the reading, italic footnotes explain period terms such as hidalgo, Rocinante or Dulcinea, and pull quotes are set apart in red, accompanied by a small windmill.",
 "t37": "The pendant is my own drawing and the starting point for the illustrations. From it, the rest, such as the stack of books of chivalry, were developed with the help of AI, keeping the same line and the same palette.",
 "t38": "The generated images were not ready to use. In the stack of books, the titles on the spines came out with errors, such as «Amaiys de Gaula» instead of Amadís de Gaula or «Ell'aballero del Fedo» instead of El Caballero del Febo, and one of the versions lost the watercolour of the rest of the project. The titles were corrected by checking them against the books of chivalry Cervantes cites, and the style was restored so the illustration matches the cover.",
 "t39": "The book is planned at a trimmed size of 135 × 190 mm and 896 pages, hardcover with sewn binding. The cover is on 170 g matte coated paper with matte lamination, the interior on 80 g cream offset and the endpapers are printed.",
 "t40": "With 896 pages, 56 signatures of 16, on 100 g offset, the spine went over 60 mm. So the interior was changed to 80 g cream offset, lighter and common in long novels, which brings it to around 50 mm.",
 "t41": "The print-ready files are prepared in CMYK with 3 mm bleed and a colour profile for each paper: Coated FOGRA39 for the cover, on coated stock, and PSO Uncoated v3 (FOGRA52) for the interior, on uncoated offset, where ink is absorbed more.",
 "t42": "When sold online, a book is almost always shown as a single flat image of its cover. It loses the information a reader gets from picking up a copy in a bookshop: its thickness, the spine, the paper finish and the text on the back cover.",
 "t43": "The goal of the project is to bring that physical experience to the screen, so the product can be examined from every side without leaving the page.",
 "t44": "The book is built as a 3D object with the real proportions of the design and the print files applied as textures. It turns with the scroll and can also be dragged with a finger or the mouse.",
 "t45": "Each side comes with its explanation, which appears when that side faces the viewer. That way the object and the information are read together, and the text never covers the book while it turns.",
 "t46": "The same model works for any product with printed sides, such as boxes, packaging, tins or tubs. By changing the dimensions, images and texts it becomes the product page of a catalogue or an online shop.",
 "t47": "The website was shown to several people with no prior explanation, and how they used it was observed without stepping in.",
 "t48": "The text moved too fast and users did not realise they were meant to read it. The pacing was redesigned so each text stays visible while the book faces the viewer and only fades out before the next turn.",
 "t49": "Several users tried to turn the book by dragging it with a finger instead of scrolling. Drag-to-turn was added, with the book returning to its position on release.",
 "t50": "The first version was made in Spline, which was dropped because of the free plan's watermark, pixelated shadows and file weight. The final model is built in Three.js, which gives full control over geometry, lighting and performance.",
 "t51": "The spine is modelled as a single U-shaped piece that bends around the corners, with the full cover, back, spine and front, as one texture. The image is continuous and there are no visible joins between pieces.",
 "t52": "A contact shadow that turns with the book grounds it on the surface so it does not look pasted on, and the book always turns on its vertical axis, without tilting.",
 "t53": "The cover typeface is embedded in the website as a web font, so the title looks the same on any device even if the font is not installed.",
 "t54": "The cover, interiors and visual system were designed in Affinity Publisher; the pendant was drawn by hand, the remaining illustrations made with the help of AI and the images edited in Affinity Photo. The website is built in HTML, CSS and JavaScript, with AI as support in development.",
 "t55": "The contrast of all texts meets the 4.5:1 minimum required by level AA.",
 "t56": "Screen readers get a description of the 3D book, and if the 3D does not load, a fallback image with its own alternative text is shown.",
 "t57": "The website works from 320 px wide with no horizontal scrolling and respects the system preference to reduce motion.",
 "a58": "Front cover of El ingenioso hidalgo Don Quijote de la Mancha: the nobleman, drawn in ink, holds a heart-shaped pendant",
 "a59": "The heart-shaped pendant, drawn by hand, with its cord",
 "a60": "The endpapers: the pendant repeated as a pattern on a red background",
 "a61": "Interior spread with a pull quote in red and a footnote about Rocinante",
 "a62": "Spread with the opening of chapter V, a red drop cap D and a footnote about the word hidalgo",
 "a63": "Chapter I spread: on the left, the stack of books of chivalry with the pendant; on the right, the red drop cap Q and the text",
 "a64": "The full cover laid flat: back cover, spine and front cover",
 "a65": "The front cover of Don Quixote shown flat, as it usually appears in an online shop",
  "a71": "The front cover and the interior spreads",
 "a72": "The front cover of the book",
 "a66": "Hardcover book of El ingenioso hidalgo don Quijote de la Mancha. As you scroll down it turns to show the front cover, the spine and the back cover."
};
  const ES = {};
  const TITULO = { es: document.title, en: 'Don Quixote · Sara Sánchez-Majano' };
  const nodos = document.querySelectorAll('[data-t]');
  const atributos = [];
  document.querySelectorAll('[data-t-alt]').forEach((el) => atributos.push([el, 'alt', el.dataset.tAlt]));
  document.querySelectorAll('[data-t-aria-label]').forEach((el) => atributos.push([el, 'aria-label', el.dataset.tAriaLabel]));
  nodos.forEach((el) => { ES[el.dataset.t] = el.innerHTML; });
  atributos.forEach(([el, at, k]) => { ES[k] = el.getAttribute(at); });
  const botones = document.querySelectorAll('.idioma button');

  function poner(lang) {
    const T = lang === 'en' ? EN : ES;
    nodos.forEach((el) => { if (T[el.dataset.t] != null) el.innerHTML = T[el.dataset.t]; });
    atributos.forEach(([el, at, k]) => { if (T[k] != null) el.setAttribute(at, T[k]); });
    document.documentElement.lang = lang;
    document.title = TITULO[lang];
    botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  botones.forEach((b) => b.addEventListener('click', () => {
    const lang = b.dataset.lang;
    poner(lang);
    try { history.replaceState(null, '', lang === 'en' ? '#en' : location.pathname + location.search); } catch (e) {}
  }));
  window.addEventListener('hashchange', () => poner(location.hash === '#en' ? 'en' : 'es'));
  if (location.hash === '#en') poner('en');
})();


/* ---------- Pasahojas: cambia de imagen cada 1,1 s, en seco ---------- */
(function () {
  const caja = document.querySelector('.pasahojas');
  if (!caja) return;
  const hojas = Array.from(caja.querySelectorAll('.pasahojas__hoja'));
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let actual = 0;
  function ir(n) {
    if (n === actual) return;
    hojas[actual].classList.remove('activa');
    actual = (n + hojas.length) % hojas.length;
    hojas[actual].classList.add('activa');
  }
  // Las imágenes no se descargan al abrir la página (no compiten con lo
  // primero que se ve): se piden cuando el pasahojas se acerca a la pantalla.
  // Espera a que todas estén listas para pintar: así ningún disparo enseña
  // un hueco vacío.
  const imgs = hojas.map((f) => f.querySelector('img'));
  const cargar = () => {
    imgs.forEach((im) => { im.loading = 'eager'; });
    return Promise.all(imgs.map((im) => (im.decode ? im.decode() : Promise.resolve()).catch(() => {})));
  };
  const cerca = new IntersectionObserver((entradas) => {
    if (!entradas.some((en) => en.isIntersecting)) return;
    cerca.disconnect();
    cargar().then(() => {
      // Solo pasa hojas mientras se ve. Al salir de la pantalla vuelve a la
      // cubierta, así siempre que llegas empieza por ella.
      let temporizador = null;
      const parar = () => { clearInterval(temporizador); temporizador = null; };
      const empezar = () => {
        parar();
        temporizador = setInterval(() => { if (!document.hidden) ir(actual + 1); }, 1100);
      };
      new IntersectionObserver((entradas) => {
        entradas.forEach((en) => {
          if (en.isIntersecting && en.intersectionRatio >= 0.5) { if (!temporizador) empezar(); }
          else if (!en.isIntersecting) { parar(); ir(0); }
        });
      }, { threshold: [0, 0.5] }).observe(caja);
    });
  }, { rootMargin: '800px 0px' });
  cerca.observe(caja);
})();
