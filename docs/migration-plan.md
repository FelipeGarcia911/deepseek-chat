# Plan de modernización

Objetivo: migrar a pnpm, actualizar Node.js y coordinar frontend y backend
como un workspace. Cada etapa tiene su propio commit y validación.

## 1. Migrar a pnpm

- Fijar pnpm 12.14.0 mediante `packageManager` en ambas aplicaciones.
- Ejecutar `pnpm import` antes de eliminar los lockfiles anteriores. El backend
  tiene archivos de npm y Yarn; pnpm prioriza package-lock.json. El frontend
  importa yarn.lock. Revisar que las dependencias directas conserven sus versiones.
- Autorizar el script de instalación de esbuild en frontend/pnpm-workspace.yaml.
  Este archivo configura pnpm localmente; aún no agrupa las dos aplicaciones.
- Mantener por ahora una instalación y un pnpm-lock.yaml por aplicación.
- Verificar instalaciones con `pnpm install --frozen-lockfile`.
- Ejecutar build y lint del frontend y comprobación de tipos del backend.

`package.json` expresa las dependencias admitidas; el lockfile fija el grafo
resuelto y sus integridades. Se versiona el lockfile, nunca node_modules.
`--frozen-lockfile` impide que una instalación modifique las resoluciones:
si manifiesto y lockfile no coinciden, falla en lugar de decidir versiones nuevas.

pnpm utiliza un almacén de contenido y enlaces para reutilizar archivos.
Su aislamiento ayuda a detectar dependencias que se usan sin declararlas.
Cambiar el gestor puede descubrir estos problemas aunque npm/Yarn funcionaran.

La validación inicial con Node 22 detectó errores previos: `indentSize` no es
una opción de TypeScript, StrictMode estaba importado sin uso, el dispatch
carecía de AppDispatch y WebVitals usaba any. Se corrigen mínimamente para
que build y lint sean una referencia útil, sin cambiar el flujo del chat.

## 2. Actualizar a Node.js 26

- Fijar 26.12.1 en `.nvmrc`: `nvm install` y `nvm use` seleccionan esa versión.
- Declarar `engines.node: ">=26.12.1 <27"` en los manifiestos.
- Alinear los tipos de Node del backend con la versión mayor 26.
- Repetir instalación, compilación y arranque HTTP bajo el nuevo runtime.

Node ejecuta JavaScript; pnpm instala paquetes; TypeScript comprueba tipos.
Son herramientas distintas. Cambiar `.nvmrc` no cambia por sí mismo el proceso
actual: siempre comprobar `node --version`. `@types/node` describe las APIs de
Node al compilador; no instala ni actualiza el ejecutable. El target de TypeScript
controla el JavaScript emitido y no tiene por qué llamarse igual que Node.

## 3. Configurar el monorepo

- Conservar las carpetas frontend/ y backend/ para evitar movimientos innecesarios.
- Añadir un package.json privado en la raíz y pnpm-workspace.yaml con ambos paquetes.
- Consolidar los dos lockfiles en uno raíz conservando las resoluciones.
- Añadir comandos raíz de desarrollo, build, typecheck y lint.
- Comprobar instalación congelada, tareas y arranque de ambas aplicaciones.

El repositorio ya contiene dos aplicaciones. El workspace añade conocimiento
de esos paquetes al gestor: una instalación coordina ambos grafos, aunque
cada aplicación conserva sus dependencias y configuración. La raíz es privada
porque coordina herramientas y no representa una librería para publicar.

`pnpm --filter frontend dev` selecciona por nombre de paquete. `pnpm -r build`
ejecuta build en los paquetes del workspace; `--parallel` permite mantener
los dos servidores de desarrollo activos a la vez. Si más adelante aparece
código compartido, puede declararse con `workspace:*`; hoy no hace falta
crear un paquete vacío ni incorporar un orquestador adicional.

## Criterios y límites de validación

Se comprueban instalación reproducible, tipos, bundle, lint y respuestas HTTP.
No existe una suite de tests en el proyecto. La generación real de respuestas
depende de un servicio Ollama y un modelo disponible: un arranque HTTP no
valida por sí solo la integración completa con ese servicio.

Referencias: [pnpm import](https://pnpm.io/cli/import),
[workspaces](https://pnpm.io/workspaces),
[Node 26.12.1](https://nodejs.org/en/blog/release/v26.12.1).

## Resultados — etapa 1

Completada con Node 22.23.2 y pnpm 12.14.0: instalación congelada de
ambas aplicaciones, build y lint del frontend y `tsc --noEmit` del backend.
Vite avisa de un bundle mayor de 500 kB; no impide compilar y su optimización
queda fuera de esta migración. Las dependencias directas importadas conservan
sus versiones anteriores.

## Resultados — etapa 2

Completada con Node 26.12.1: instalaciones congeladas, tipos del backend,
build y lint del frontend. El backend arrancó con nodemon/ts-node y
GET /api/chats/list respondió HTTP 200 con un array JSON.
`@types/node` pasó de 22.12.0 a 26.6.5; sus dependencias transitivas
se actualizaron con él. No se ha probado una llamada de generación a Ollama.

## Guía práctica del resultado

Desde la raíz, `nvm use` selecciona Node 26.12.1 y
`pnpm install --frozen-lockfile` instala los dos paquetes. La raíz fija pnpm
12.14.0; `engineStrict: true` en pnpm-workspace.yaml rechaza instalaciones
con una versión de Node fuera del rango declarado.

- `pnpm dev`: ejecuta los dos scripts dev en paralelo. Ctrl+C los detiene.
- `pnpm dev:frontend` / `pnpm dev:backend`: seleccionan una aplicación.
- `pnpm typecheck`: comprueba ambos proyectos TypeScript.
- `pnpm lint`: comprueba el frontend; el backend no tiene configuración ESLint.
- `pnpm build`: genera frontend/dist y backend/dist.
- `pnpm --filter backend start`: arranca el backend compilado.
- `pnpm --filter frontend add <paquete>`: modifica solo las dependencias del frontend.

Al añadir una dependencia se actualizan el manifiesto del paquete y el
lockfile raíz. Ambos cambios van juntos en Git. No hay dependencias de runtime
en la raíz: Express pertenece al backend y React al frontend. Tampoco se
fuerzan versiones iguales de TypeScript: cada aplicación conserva la suya.

El lockfile consolidado tiene importadores backend y frontend. Se comprobaron
contra los dos archivos anteriores: importadores, paquetes y snapshots
coinciden, por lo que la conversión no actualiza dependencias. Las entradas
de herramientas de pnpm se mantienen en el documento de toolchain del lockfile.

Para revisar el proceso, `git show <commit>` muestra cada etapa. Para recuperar
un cambio publicado se puede crear un commit inverso con `git revert <commit>`;
las etapas deben deshacerse en orden inverso, comenzando por el workspace.

## Resultados — etapa 3

Completada con Node 26.12.1 y pnpm 12.14.0:

- Instalación del workspace con `pnpm install --frozen-lockfile`, sin resolver versiones nuevas.
- `pnpm typecheck`, `pnpm lint` y `pnpm build` finalizaron correctamente.
- `pnpm dev` arrancó ambas aplicaciones: frontend HTTP 200 en localhost:5173
  y backend HTTP 200 con array JSON en /api/chats/list (puerto temporal 4017).
- `pnpm --filter backend start` atendió /api/chats/list con HTTP 200
  usando el JavaScript compilado (puerto temporal 4018).
- Los procesos de comprobación se detuvieron al terminar.

La advertencia de Vite sobre el tamaño del bundle permanece. No se ha validado
la generación de respuestas con Ollama ni añadido una suite de tests.
