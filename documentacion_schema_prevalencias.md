# Módulo de Evaluación de Prevalencias — DMC
## Documentación del Schema de Base de Datos
**Supabase (PostgreSQL) · v1.0**

---

## Contexto del Módulo

Este módulo es **independiente del módulo de acreditación**. Comparte únicamente la tabla `sede` del sistema existente. Todo lo demás — personal, catálogos, procesos y autenticación — es propio de este módulo.

El proceso consiste en evaluar a personal asistencial en campo. Un evaluador de Calidad observa al trabajador y registra respuestas (SI / NO / NA) para cada pregunta de 6 sets predefinidos. La evaluación se realiza por rondas (varias veces al año por sede).

---

## Arquitectura general

```
CATÁLOGOS (corporativos, sin sede)
  upss                    → Unidades productoras (Emergencia, UCI…)
  grupo_profesional       → Grupos asistenciales (Enfermera, Médico…)
  set_preguntas           → Los 6 procesos a evaluar
  pregunta                → Preguntas por set (CRUD desde web)

PERSONAL
  personal_prevalencia    → Personal asistencial por sede/upss/grupo

AUTH EVALUADORES (Supabase Auth + RLS)
  evaluador_perfil        → Evaluadores de Calidad (vinculados a auth.users)
  evaluador_sede_upss     → Permisos: qué sedes/UPSS puede ver cada evaluador

OPERACIÓN (generada por la app)
  proceso_prevalencia     → Cada ronda evaluativa (sede + fecha)
  evaluacion_personal     → Una por persona evaluada en una ronda
  evaluacion_set          → Un set por persona (6 por evaluacion_personal)
  respuesta               → Una por pregunta respondida
```

---

## Tablas

---

### `upss`
Catálogo corporativo de Unidades Productoras de Servicios de Salud.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| nombre | varchar | nombre de la UPSS (EMERGENCIA, UCI…) |
| orden | int | orden de visualización |
| activa | boolean | para desactivar sin borrar |

**Datos cargados:** 14 UPSS (Consulta Externa, Emergencia, Hospitalización, Centro Quirúrgico, Centro Obstétrico, Central de Esterilización, Banco de Sangre, Endoscopía, Farmacia, Médicos, Neonatología, Nutrición, UCI, Diagnóstico por Imágenes).

---

### `grupo_profesional`
Catálogo corporativo de grupos profesionales asistenciales. Separado de los cargos administrativos del módulo de acreditación.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| nombre | varchar | nombre del grupo (ENFERMERIA, MEDICINA…) |
| orden | int | orden de visualización |
| activo | boolean | para desactivar sin borrar |

**Datos cargados:** 9 grupos (Administrativo, Enfermería, Medicina, Nutricionista, Obstetricia, Técnico de Enfermería, Técnico de Radiología e Imágenes, Técnico en Farmacia, Tecnólogo Médico).

---

### `set_preguntas`
Los 6 procesos que se evalúan. Este catálogo es fijo — no se agrega ni elimina desde la app, solo se administra desde la web.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| nombre | varchar | nombre del set |
| descripcion | text | descripción del proceso |
| orden | int | orden de visualización |
| activo | boolean | para desactivar sin borrar |

**Datos cargados:** 6 sets (Lavado de manos, Administración de medicamentos, Prevención de caídas, Prevención de úlceras por presión, Correcta identificación del paciente, Uso de EPP).

---

### `pregunta`
Preguntas de cada set. Administrable desde la app web (CRUD completo).

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| set_id | uuid FK → set_preguntas | set al que pertenece |
| texto | text | enunciado de la pregunta |
| orden | int | orden dentro del set (relativo, empieza en 1 por set) |
| respuesta_esperada | text | referencia para el evaluador en campo (opcional) |
| activa | boolean | desactivar en lugar de borrar para preservar histórico |

> ⚠️ **Importante:** nunca borrar preguntas que ya tienen respuestas registradas. Usar `activa = false`. El frontend debe filtrar siempre por `activa = true` al mostrar el formulario de evaluación, pero mostrar todas (incluyendo inactivas) en el historial.

---

### `personal_prevalencia`
Personal asistencial sujeto a evaluación. Independiente del personal del módulo de acreditación.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| sede_id | uuid FK → sede | sede donde trabaja |
| upss_id | uuid FK → upss | UPSS a la que pertenece |
| grupo_profesional_id | uuid FK → grupo_profesional | grupo profesional |
| nombre_completo | varchar | nombre completo (apellidos + nombres) |
| cargo | varchar | cargo específico (info extra, no se filtra en dashboard) |
| activo | boolean | false cuando ya no pertenece a la organización |

**Query útil — listar personal con nombres de catálogo:**
```sql
select
  pp.id,
  pp.nombre_completo,
  pp.cargo,
  s.nombre  as sede,
  u.nombre  as upss,
  g.nombre  as grupo_profesional,
  pp.activo
from personal_prevalencia pp
join sede              s on s.id = pp.sede_id
join upss              u on u.id = pp.upss_id
join grupo_profesional g on g.id = pp.grupo_profesional_id
where pp.activo = true
order by s.nombre, u.nombre, pp.nombre_completo;
```

---

### `evaluador_perfil`
Evaluadores de Calidad que usan la app móvil. Vinculados a Supabase Auth.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| user_id | uuid FK → auth.users | login de Supabase Auth |
| nombre | varchar | nombre del evaluador |
| apellido | varchar | apellido del evaluador |
| activo | boolean | para desactivar acceso sin borrar historial |

> Los evaluadores se crean manualmente desde el panel de Supabase (Auth → Users) y luego se inserta su perfil en esta tabla.

---

### `evaluador_sede_upss`
Permisos del evaluador: qué sedes y UPSS puede ver y registrar.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| evaluador_id | uuid FK → evaluador_perfil | evaluador |
| sede_id | uuid FK → sede | sede permitida |
| upss_id | uuid FK → upss | UPSS permitida dentro de esa sede (`null` = todas) |

**Ejemplo:** un evaluador con dos filas `(sede: Lima Centro, upss: null)` y `(sede: Los Olivos, upss: Emergencia)` puede evaluar cualquier UPSS en Lima Centro pero solo Emergencia en Los Olivos.

---

### `proceso_prevalencia`
Cada ronda de evaluación por sede. Equivalente al `proceso_acreditacion` pero con calendario propio (puede ocurrir varias veces al año).

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| sede_id | uuid FK → sede | sede del proceso |
| nombre | varchar | nombre descriptivo (ej: "Ronda 1 — Enero 2025") |
| fecha | date | fecha de la ronda |
| estado | varchar | `activo` / `cerrado` / `cancelado` |
| created_at | timestamptz | fecha de creación |

---

### `evaluacion_personal`
Una fila por persona evaluada en un proceso. Agrupa los 6 sets de esa persona en esa ronda.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| proceso_id | uuid FK → proceso_prevalencia | ronda a la que pertenece |
| personal_id | uuid FK → personal_prevalencia | persona evaluada |
| fecha_hora | timestamptz | momento en que se inició la evaluación |
| observacion | text | observación general sobre la persona (opcional) |

**Restricción:** `unique(proceso_id, personal_id)` — una persona no puede evaluarse dos veces en la misma ronda.

---

### `evaluacion_set`
Un registro por set por persona evaluada. Aquí vive el estado de cada formulario y quién lo llenó.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| evaluacion_personal_id | uuid FK → evaluacion_personal | evaluación a la que pertenece |
| set_id | uuid FK → set_preguntas | set evaluado |
| evaluador_id | uuid FK → evaluador_perfil | quién guardó este set (puede diferir entre sets) |
| estado | varchar | `pendiente` / `completado` / `incompleto` |
| observacion | text | observación del evaluador sobre este set (no por pregunta) |
| fecha_inicio | timestamptz | cuando se abrió el formulario |
| fecha_fin | timestamptz | cuando se presionó "Guardar Respuestas" |

**Restricción:** `unique(evaluacion_personal_id, set_id)` — un set no se repite por persona por ronda.

**Lógica de estado:**
- `pendiente` → aún no se ha guardado ninguna respuesta
- `completado` → el evaluador presionó "Guardar Respuestas" exitosamente
- `incompleto` → la evaluación fue interrumpida (el evaluado se fue, etc.)

> ⚠️ Una vez que `estado = completado`, el formulario se bloquea. El frontend no debe permitir edición. La DB refuerza esto a nivel de RLS: la policy de inserción en `respuesta` solo permite insertar si `evaluacion_set.estado = 'pendiente'`.

---

### `respuesta`
Una fila por pregunta respondida dentro de un set.

| campo | tipo | descripción |
|---|---|---|
| id | uuid PK | identificador |
| evaluacion_set_id | uuid FK → evaluacion_set | set al que pertenece |
| pregunta_id | uuid FK → pregunta | pregunta respondida |
| valor | varchar | `SI` / `NO` / `NA` (check constraint en DB) |

**Restricción:** `unique(evaluacion_set_id, pregunta_id)` — una pregunta no se responde dos veces en el mismo set.

**Restricción de DB:** `valor` solo acepta exactamente `'SI'`, `'NO'`, `'NA'` en mayúsculas. El frontend debe enviar estos valores en ese formato.

---

## Flujo operativo completo

```
1. Coordinador crea proceso_prevalencia (sede + fecha + nombre)

2. Evaluador abre app móvil → ve solo los procesos de sus sedes asignadas (RLS)

3. Evaluador selecciona proceso → ve lista de personal_prevalencia de esa sede

4. Evaluador selecciona persona → se crea evaluacion_personal

5. Por cada set (los 6):
   a. Se crea evaluacion_set con estado = 'pendiente' y fecha_inicio
   b. Evaluador responde las preguntas del set (SI / NO / NA)
   c. Evaluador escribe observacion del set (opcional)
   d. Evaluador presiona "Guardar Respuestas":
      → Se insertan todas las respuestas en bloque
      → evaluacion_set.estado = 'completado'
      → evaluacion_set.evaluador_id = auth.uid() del evaluador
      → evaluacion_set.fecha_fin = now()
      → El formulario queda bloqueado y muestra quién lo llenó

6. Si la evaluación se interrumpe:
   → evaluacion_set.estado = 'incompleto'
   → Los sets ya completados quedan intactos
   → Los sets pendientes quedan en 'pendiente' para retomar
```

---

## Autenticación y RLS

Solo las tablas operacionales tienen RLS activo. Las tablas de catálogo y personal son de lectura pública (el frontend web las consume sin JWT).

| Tabla | RLS | Descripción de la policy |
|---|---|---|
| `proceso_prevalencia` | ✅ | Evaluador solo ve procesos de sus sedes asignadas |
| `evaluacion_personal` | ✅ | Evaluador solo ve evaluaciones de sus procesos |
| `evaluacion_set` | ✅ | Evaluador puede gestionar sets de sus evaluaciones |
| `respuesta` | ✅ | Solo inserta si `evaluacion_set.estado = 'pendiente'` |
| `upss` | ❌ | Lectura pública |
| `grupo_profesional` | ❌ | Lectura pública |
| `set_preguntas` | ❌ | Lectura pública |
| `pregunta` | ❌ | Lectura pública |
| `personal_prevalencia` | ❌ | Lectura pública |
| `evaluador_perfil` | ❌ | Administración manual en Supabase |
| `evaluador_sede_upss` | ❌ | Administración manual en Supabase |

**Para la app móvil:** usar el cliente de Supabase con la sesión del usuario autenticado. Las políticas RLS se aplican automáticamente usando `auth.uid()`.

**Para la app web:** puede usar la `anon key` para leer catálogos y personal. Para crear procesos y gestionar datos administrativos usar `service role` desde el servidor Next.js (nunca exponer en el cliente).

---

## Separación con el módulo de acreditación

| Aspecto | Acreditación | Prevalencias |
|---|---|---|
| Personal | `personal` (cargos gerenciales/administrativos) | `personal_prevalencia` (asistencial) |
| Procesos | `proceso_acreditacion` (anual o bianual) | `proceso_prevalencia` (varias veces al año) |
| Autenticación | Sin auth (service role desde Next.js) | Supabase Auth + RLS para app móvil |
| Catálogos | `area`, `responsable` (roles corporativos) | `upss`, `grupo_profesional` (roles asistenciales) |
| Tabla compartida | `sede` | `sede` |

> ⚠️ **Nunca mezclar** `personal` con `personal_prevalencia` ni `upss` con `area`. Son catálogos de naturaleza distinta aunque superficialmente parezcan similares.

---

## Queries de referencia para el frontend

**Obtener sets con sus preguntas:**
```sql
select
  sp.id        as set_id,
  sp.nombre    as set_nombre,
  sp.orden     as set_orden,
  p.id         as pregunta_id,
  p.texto,
  p.orden      as pregunta_orden,
  p.respuesta_esperada
from set_preguntas sp
join pregunta p on p.set_id = sp.id
where sp.activo = true
  and p.activa  = true
order by sp.orden, p.orden;
```

**Obtener estado de evaluación de una persona en un proceso:**
```sql
select
  es.id,
  sp.nombre    as set_nombre,
  sp.orden,
  es.estado,
  es.observacion,
  es.fecha_fin,
  ep2.nombre || ' ' || ep2.apellido as evaluador
from evaluacion_set es
join set_preguntas   sp  on sp.id  = es.set_id
left join evaluador_perfil ep2 on ep2.id = es.evaluador_id
where es.evaluacion_personal_id = '<evaluacion_personal_id>'
order by sp.orden;
```

**Obtener resultados de un set completado:**
```sql
select
  p.texto,
  p.orden,
  r.valor,
  p.respuesta_esperada
from respuesta r
join pregunta p on p.id = r.pregunta_id
where r.evaluacion_set_id = '<evaluacion_set_id>'
order by p.orden;
```

**Dashboard — conteo de evaluaciones por UPSS en un proceso:**
```sql
select
  u.nombre as upss,
  count(distinct ep.personal_id) as total_evaluados,
  count(distinct case when es.estado = 'completado' then es.id end) as sets_completados,
  count(distinct case when es.estado = 'incompleto' then es.id end) as sets_incompletos,
  count(distinct case when es.estado = 'pendiente'  then es.id end) as sets_pendientes
from evaluacion_personal ep
join personal_prevalencia pp on pp.id = ep.personal_id
join upss                 u  on u.id  = pp.upss_id
left join evaluacion_set  es on es.evaluacion_personal_id = ep.id
where ep.proceso_id = '<proceso_prevalencia_id>'
group by u.nombre
order by u.nombre;
```
