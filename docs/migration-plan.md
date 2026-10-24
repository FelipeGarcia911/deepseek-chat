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
