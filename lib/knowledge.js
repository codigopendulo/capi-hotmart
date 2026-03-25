// ============================================================
// MÚSCULO LAB — Base de Conocimiento del Agente
// ============================================================

const PRODUCTOS = [
  {
    id: 'gym',
    nombre: 'Cómo Entrenar Bien en el Gym — Guía Completa + 4 Bonos',
    handle: 'como-entrenar-bien-en-el-gym-guia-completa-4-bonos',
    descripcion: 'Guía completa para entrenar en el gimnasio con ciencia. Técnica, rutinas, progresión y nutrición.',
    para_quien: 'Hombres y mujeres que van al gym y quieren entrenar bien con fundamento científico.',
    paginas: '200+',
    precio_ar: '$14.999 ARS',
    precio_usd: '$9 USD',
    bonos: [
      'Rutinas de 12 semanas',
      'Guía de Suplementación',
      'Calculadora de Macros',
      'Guía de Estiramiento'
    ],
    landing_ar: 'https://musculolab.lat/pages/como-entrenar-bien-en-el-gym',
    landing_int: 'https://pay.hotmart.com/I104547441C?checkoutMode=10',
    keywords: ['gym', 'gimnasio', 'pesas', 'entrenar', 'fuerza', 'hipertrofia'],
  },
  {
    id: 'mujeres',
    nombre: 'Guía de Entrenamiento para Mujeres — Pack Completo + 4 Bonos',
    handle: 'guia-de-entrenamiento-para-mujeres-pack-completo-4-bonos',
    descripcion: 'Guía específica para mujeres que entrenan en gym. Rutinas, glúteos, abdomen, cardio y nutrición femenina.',
    para_quien: 'Mujeres que entrenan en gimnasio y quieren una guía diseñada para su fisiología.',
    paginas: '200+',
    precio_ar: '$14.999 ARS',
    precio_usd: '$9 USD',
    bonos: [
      'Rutinas Glúteos Intensivas',
      'Plan Nutricional Femenino',
      'Guía de Cardio HIIT',
      'Movilidad y Flexibilidad'
    ],
    landing_ar: 'https://musculolab.lat/pages/gymmujeres',
    landing_int: 'https://pay.hotmart.com/R104629036L?checkoutMode=10',
    keywords: ['mujer', 'mujeres', 'femenino', 'gym mujer', 'chica'],
  },
  {
    id: 'recetario',
    nombre: 'Recetario Fitness — 108 Recetas con Macros Calculados + 5 Bonos',
    handle: 'recetario-fitness-108-recetas-con-macros-calculados-5-bonos',
    descripcion: '108 recetas fitness con macros calculados. Desayunos, almuerzos, cenas, snacks y postres saludables.',
    para_quien: 'Cualquier persona que quiera comer bien, con macros calculados y recetas fáciles.',
    paginas: '150+',
    precio_ar: '$14.999 ARS',
    precio_usd: '$9 USD',
    bonos: [
      'Meal Prep Semanal',
      'Guía de Suplementos',
      'Lista de Compras',
      'Snacks Rápidos',
      'Postres Fitness'
    ],
    landing_ar: 'https://musculolab.lat/pages/recetariofitness',
    landing_int: 'https://pay.hotmart.com/Q104712566V?checkoutMode=10',
    keywords: ['receta', 'recetario', 'comida', 'nutrición', 'macros', 'cocinar', 'dieta'],
  },
  {
    id: 'gluteos',
    nombre: 'Glúteos con Ciencia — Pack Completo + 4 Bonos',
    handle: 'gluteosconciencia',
    descripcion: 'Guía especializada en entrenamiento de glúteos con base científica. Ejercicios, rutinas y activación.',
    para_quien: 'Mujeres que quieren desarrollar glúteos con ejercicios y rutinas específicas basadas en ciencia.',
    paginas: '180+',
    precio_ar: '$14.999 ARS',
    precio_usd: '$9 USD',
    bonos: [
      'Rutinas de Activación',
      'Bandas Elásticas',
      'Nutrición para Glúteos',
      'Movilidad de Cadera'
    ],
    landing_ar: 'https://musculolab.lat/pages/gluteos',
    landing_int: 'https://pay.hotmart.com/H104799008S?checkoutMode=10',
    keywords: ['glúteo', 'gluteos', 'cola', 'piernas', 'hip thrust'],
  },
  {
    id: 'definicion',
    nombre: 'Definición con Ciencia — El Sistema Completo para Definir + 4 Bonos',
    handle: 'definicion-con-ciencia-el-sistema-completo-para-definir-4-bonos',
    descripcion: 'Sistema completo para definición muscular. Déficit calórico, rutinas, cardio y suplementación.',
    para_quien: 'Personas que quieren bajar grasa corporal y definir manteniendo músculo.',
    paginas: '200+',
    precio_ar: '$14.999 ARS',
    precio_usd: '$9 USD',
    bonos: [
      'Rutinas de Definición 12 semanas',
      'Guía de Cardio Óptimo',
      'Protocolo de Suplementos',
      'Recetas de Déficit'
    ],
    landing_ar: 'https://musculolab.lat/pages/definicion',
    landing_int: 'https://pay.hotmart.com/C104936101L?checkoutMode=10',
    keywords: ['definición', 'definir', 'bajar grasa', 'corte', 'cutting', 'marcar'],
  },
  {
    id: 'casa_mujeres',
    nombre: 'Entrenamiento en Casa para Mujeres — Pack Completo + 4 Bonos',
    handle: 'entrenamiento-en-casa-para-mujeres',
    descripcion: 'Guía completa para entrenar en casa sin equipamiento. Rutinas, HIIT, glúteos, abdomen y cardio.',
    para_quien: 'Mujeres que quieren entrenar en casa sin ir al gimnasio, con poco o ningún equipamiento.',
    paginas: '200+',
    precio_ar: '$14.999 ARS',
    precio_usd: '$9 USD',
    bonos: [
      'Rutinas Express 15 minutos',
      'HIIT Quema Grasa',
      'Yoga y Estiramientos',
      'Plan Nutricional'
    ],
    landing_ar: 'https://musculolab.lat/pages/casa-mujeres',
    landing_int: 'https://pay.hotmart.com/B104990340O?checkoutMode=10',
    keywords: ['casa', 'hogar', 'sin gym', 'sin equipamiento', 'bodyweight'],
  },
];

const FAQS = [
  {
    pregunta: '¿Cómo descargo el ebook?',
    respuesta: 'Después de la compra te llega un email con el link de descarga. Si compraste por Shopify (Argentina), revisá tu email (incluso spam). Si compraste por Hotmart (internacional), entrá a tu cuenta de Hotmart y descargalo desde "Mis Compras". Los archivos son PDF, los podés ver en el celu, tablet o compu.',
  },
  {
    pregunta: '¿No me llegó el email de descarga',
    respuesta: 'Revisá la carpeta de spam o correo no deseado. Si no aparece, pasame el email con el que compraste y te ayudo a buscar la orden.',
  },
  {
    pregunta: '¿En qué formato es el ebook?',
    respuesta: 'Todos los ebooks son en formato PDF. Los podés abrir en cualquier celular, tablet o computadora. Son tuyos para siempre.',
  },
  {
    pregunta: '¿Tiene garantía?',
    respuesta: 'Sí, todos los productos tienen garantía de satisfacción. Si no te sirve, escribinos y lo resolvemos.',
  },
  {
    pregunta: '¿Se puede pagar con tarjeta?',
    respuesta: 'Sí. En Argentina se paga por MercadoPago (tarjeta, débito, transferencia). Internacional se paga por Hotmart (tarjeta, PayPal).',
  },
  {
    pregunta: '¿Sirve para principiantes?',
    respuesta: 'Sí, todas las guías están pensadas desde cero. Tienen explicación de cada ejercicio con técnica e ilustraciones, y rutinas progresivas.',
  },
  {
    pregunta: '¿Puedo pagar en cuotas?',
    respuesta: 'En Argentina sí, con MercadoPago podés pagar en cuotas con tarjeta de crédito.',
  },
  {
    pregunta: '¿Es para hombres o mujeres?',
    respuesta: 'Tenemos guías específicas. "Cómo Entrenar en el Gym" y "Definición con Ciencia" son unisex. "Guía para Mujeres", "Glúteos con Ciencia" y "Entrenamiento en Casa" son específicas para mujeres. El Recetario es para todos.',
  },
  {
    pregunta: '¿Cuánto cuesta?',
    respuesta: 'Todos los packs están a $14.999 ARS (Argentina) o $9 USD (internacional). Incluyen el ebook principal + 4 bonos exclusivos.',
  },
  {
    pregunta: '¿Qué incluyen los bonos?',
    respuesta: 'Cada pack viene con 4-5 ebooks extra de regalo. Son complementos del tema principal: rutinas extra, nutrición, suplementación, etc. Depende del producto.',
  },
  {
    pregunta: 'reembolso',
    respuesta: 'ESCALAR_A_HUMANO',  // señal para que el agente escale
  },
];

const INSTRUCCIONES_DESCARGA = {
  shopify: `📱 Instrucciones de descarga (Argentina — Shopify):
1. Revisá el email con el que compraste (mirá spam también)
2. Vas a ver un email de Músculo Lab con el asunto "Tu descarga está lista"
3. Hacé click en el botón de descarga
4. Se bajan los PDFs a tu celu/compu
5. Si no lo encontrás, pasame tu email de compra y te ayudo`,

  hotmart: `📱 Instrucciones de descarga (Internacional — Hotmart):
1. Revisá el email de Hotmart (mirá spam también)
2. Entrá a hotmart.com → "Mis Compras" o "My Purchases"
3. Buscá el producto y hacé click en "Acceder"
4. Descargá los PDFs desde ahí
5. Si no lo encontrás, pasame tu email de compra y te ayudo`,
};

// Buscar producto por keywords o texto libre
function findProduct(text) {
  const lower = text.toLowerCase();
  // Buscar match por keywords
  for (const prod of PRODUCTOS) {
    for (const kw of prod.keywords) {
      if (lower.includes(kw.toLowerCase())) return prod;
    }
  }
  // Buscar match por nombre
  for (const prod of PRODUCTOS) {
    if (lower.includes(prod.id)) return prod;
  }
  return null;
}

// Buscar FAQ relevante
function findFAQ(text) {
  const lower = text.toLowerCase();
  for (const faq of FAQS) {
    const keywords = faq.pregunta.toLowerCase().split(/\s+/);
    const matchCount = keywords.filter(k => k.length > 3 && lower.includes(k)).length;
    if (matchCount >= 2) return faq;
  }
  return null;
}

module.exports = {
  PRODUCTOS,
  FAQS,
  INSTRUCCIONES_DESCARGA,
  findProduct,
  findFAQ,
};
